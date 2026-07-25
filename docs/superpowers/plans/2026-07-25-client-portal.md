# Client Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client's contact log into a read-only web portal (magic-link email login) to see their own case status, next hearing, firm-published documents, and issued/paid invoices.

**Architecture:** A fully separate NestJS auth realm (`client-portal` module: own JWT secret, guard, strategy, controllers) so a portal token can never reach staff routes, and every query is server-scoped by the authenticated contact's `clientId`. Two additive schema fields (`ClientContact.portalEnabled`, `Document.visibleToClient`, both default `false`) close the "everything leaks by default" risk. A new Next.js route group `(client-portal)/portal/*` with its own auth context, separate from the staff dashboard.

**Tech Stack:** NestJS 11, Prisma 6 (PostgreSQL), passport-jwt, SendGrid (`@sendgrid/mail`), Next.js 15 / React 19, existing `apps/web/src/components/ui/*` primitives.

## Global Constraints

- Follow the design spec exactly: [docs/superpowers/specs/2026-07-25-client-portal-design.md](../specs/2026-07-25-client-portal-design.md). One deviation from that spec, corrected during planning after reading the actual codebase: the staff app stores its JWT in `localStorage` and sends it as an `Authorization: Bearer` header (see `apps/web/src/lib/api.ts` / `apps/web/src/lib/auth.tsx`) — there is no cookie-parser or cookie-based session anywhere in this codebase. The portal follows the exact same convention (localStorage + Bearer) instead of an httpOnly cookie, for consistency with the rest of the app. The security intent (single-use magic link → short-lived scoped token → server-side re-validation on every request) is unchanged.
- **No test runner is configured in this repo** (no jest/vitest in either `apps/api/package.json` or `apps/web/package.json`, no `*.spec.ts` files exist). Do not introduce one as a side effect of this feature — that's a separate decision for the user to make. Every task below substitutes concrete, runnable verification for automated tests: `pnpm --filter api build` / `pnpm --filter web build` (type-checks), plus exact `curl` commands with expected output, plus a manual browser walkthrough for the frontend tasks. Every verification step must actually be run and its real output checked before moving on — do not skip it because "the code looks right."
- All new backend files follow the existing module shape exactly: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/*.dto.ts` with `class-validator` decorators, `PrismaService` imported from `'../prisma/prisma.module'` (it's `@Global()`, no explicit module import needed).
- All new frontend files follow the existing conventions: `'use client'` pages under `apps/web/src/app/`, Tailwind utility classes matching the existing dashboard/login pages, reuse `@/components/ui/{button,input,card,badge}` — do not add new UI primitives.
- Every new endpoint that is publicly reachable (not behind `ClientPortalGuard`) must have `@SkipSubscription()` — this repo's `SubscriptionGuard` is a global `APP_GUARD`; the existing convention (see `auth.controller.ts`) is to mark every pre-login endpoint explicitly, even though the guard also short-circuits when `request.user` is unset.
- Known, accepted limitation (do not attempt to fix in this plan): `ClientsService.update()` replaces all of a client's contacts via `deleteMany` + `createMany` on any contacts edit, which changes every contact's `id`. That means any pending (unused) magic-link token or an already-issued portal JWT is invalidated whenever staff edit *any* field on *any* contact for that client. This is pre-existing behavior in `clients.service.ts`, not something this feature introduces — it's flagged here so nobody is surprised by it during manual testing, not something to redesign now (YAGNI).

---

### Task 1: Schema migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `ClientContact.portalEnabled: boolean`, `Document.visibleToClient: boolean`, `ClientPortalLoginToken` model (`id`, `clientContactId`, `token` unique, `expiresAt`, `usedAt?`, `createdAt`) — every later backend task depends on these three.

- [ ] **Step 1: Add `portalEnabled` to `ClientContact`**

In `apps/api/prisma/schema.prisma`, find the `ClientContact` model and add the new field:

```prisma
model ClientContact {
  id            String  @id @default(uuid())
  clientId      String
  name          String
  email         String?
  phone         String?
  position      String?
  isPrimary     Boolean @default(false)
  portalEnabled Boolean @default(false)

  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)
  loginTokens ClientPortalLoginToken[]

  @@index([clientId])
}
```

(This adds `portalEnabled` and the new `loginTokens` back-relation; every other field is unchanged.)

- [ ] **Step 2: Add `visibleToClient` to `Document`**

Find the `Document` model and add the field:

```prisma
model Document {
  id              String   @id @default(uuid())
  caseId          String
  filename        String
  storagePath     String
  mimeType        String
  version         Int      @default(1)
  uploadedById    String
  visibleToClient Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  case       Case              @relation(fields: [caseId], references: [id], onDelete: Cascade)
  uploadedBy User              @relation(fields: [uploadedById], references: [id])
  versions   DocumentVersion[]
  knowledge  CaseKnowledge[]
}
```

- [ ] **Step 3: Add the `ClientPortalLoginToken` model**

Add this new model directly after the `ClientContact` model:

```prisma
model ClientPortalLoginToken {
  id              String    @id @default(uuid())
  clientContactId String
  token           String    @unique
  expiresAt       DateTime
  usedAt          DateTime?
  createdAt       DateTime  @default(now())

  clientContact ClientContact @relation(fields: [clientContactId], references: [id], onDelete: Cascade)

  @@index([clientContactId])
}
```

- [ ] **Step 4: Run the migration**

Run: `pnpm --filter api prisma migrate dev --name add_client_portal`
Expected: output ends with `Your database is now in sync with your schema.` and a new folder appears under `apps/api/prisma/migrations/` with a name ending in `_add_client_portal`.

- [ ] **Step 5: Verify the generated Prisma client has the new fields**

Run: `grep -n "portalEnabled\|visibleToClient\|ClientPortalLoginToken" apps/api/src/generated/prisma/index.d.ts | head -5`
Expected: at least one match for each of the three names (confirms `prisma generate` ran as part of the migration and the client types exist).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add client portal schema (portalEnabled, visibleToClient, login tokens)"
```

---

### Task 2: Client portal auth — token issuance, email, JWT strategy

**Files:**
- Create: `apps/api/src/client-portal/dto/client-portal-auth.dto.ts`
- Create: `apps/api/src/client-portal/client-portal-auth.service.ts`
- Create: `apps/api/src/client-portal/client-portal-auth.controller.ts`
- Create: `apps/api/src/client-portal/client-portal-jwt.strategy.ts`
- Create: `apps/api/src/client-portal/client-portal.guard.ts`
- Create: `apps/api/src/client-portal/current-portal-user.decorator.ts`
- Create: `apps/api/src/client-portal/client-portal.module.ts`
- Modify: `apps/api/src/notifications/email.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: `PrismaService` (from `'../prisma/prisma.module'`), `EmailService.getAppUrl()` and `EmailService.isConfigured()` (existing, from `apps/api/src/notifications/email.service.ts`).
- Produces: `PortalIdentity { clientContactId: string; clientId: string; firmId: string; name: string; email: string | null }` (exported from `client-portal-jwt.strategy.ts`) — Task 3's controller and service depend on this exact shape. `POST /client-portal/auth/request-link` and `POST /client-portal/auth/verify` — Task 8's frontend `portal-api.ts` depends on these two exact routes and response shapes.

- [ ] **Step 1: Add the magic-link email method to `EmailService`**

In `apps/api/src/notifications/email.service.ts`, add this interface near `InvitationEmailParams` and this method inside the `EmailService` class (after `sendInvitationEmail`):

```typescript
export interface ClientPortalMagicLinkParams {
  to: string;
  contactName: string;
  firmName: string;
  verifyUrl: string;
  expiresAt: Date;
}
```

```typescript
  async sendClientPortalMagicLinkEmail(params: ClientPortalMagicLinkParams): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL); skipped portal login email to ${params.to}`,
      );
      return;
    }

    const fromEmail = this.getFromEmail()!;
    const expiresLabel = params.expiresAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const text = [
      `Sign in to your ${params.firmName} client portal.`,
      `Hi ${params.contactName}, use this link to view your case status, documents, and invoices:`,
      params.verifyUrl,
      `This link expires at ${expiresLabel} and can only be used once.`,
    ].join('\n\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
        <h2 style="margin:0 0 12px">Sign in to ${params.firmName}</h2>
        <p>Hi <strong>${params.contactName}</strong>, use the button below to view your case status, documents, and invoices.</p>
        <p style="margin:24px 0">
          <a href="${params.verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
            Sign in to client portal
          </a>
        </p>
        <p style="font-size:14px;color:#6b7280">Or copy this link:<br><a href="${params.verifyUrl}">${params.verifyUrl}</a></p>
        <p style="font-size:14px;color:#6b7280">This link expires at ${expiresLabel} and can only be used once.</p>
      </div>
    `.trim();

    try {
      await sgMail.send({
        to: params.to,
        from: { email: fromEmail, name: this.getFromName() },
        subject: `Sign in to your ${params.firmName} client portal`,
        text,
        html,
      });
      this.logger.log(`Client portal magic link email sent to ${params.to}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'response' in error
            ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body)
            : 'Unknown SendGrid error';
      this.logger.error(`Failed to send client portal magic link email to ${params.to}: ${message}`);
      throw error;
    }
  }
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter api build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/email.service.ts
git commit -m "feat: add client portal magic-link email"
```

- [ ] **Step 4: Add the auth DTOs**

Create `apps/api/src/client-portal/dto/client-portal-auth.dto.ts`:

```typescript
import { IsEmail, IsString } from 'class-validator';

export class RequestPortalLinkDto {
  @IsEmail()
  email!: string;
}

export class VerifyPortalTokenDto {
  @IsString()
  token!: string;
}
```

- [ ] **Step 5: Add the JWT strategy and `PortalIdentity` type**

Create `apps/api/src/client-portal/client-portal-jwt.strategy.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.module';

interface PortalJwtPayload {
  sub: string;
  clientId: string;
  firmId: string;
}

export interface PortalIdentity {
  clientContactId: string;
  clientId: string;
  firmId: string;
  name: string;
  email: string | null;
}

@Injectable()
export class ClientPortalJwtStrategy extends PassportStrategy(Strategy, 'client-portal-jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: config.get<string>('CLIENT_PORTAL_JWT_SECRET') ?? 'dev-client-portal-secret',
    });
  }

  async validate(req: Request, payload: PortalJwtPayload): Promise<PortalIdentity> {
    const contact = await this.prisma.clientContact.findUnique({
      where: { id: payload.sub },
    });
    if (!contact || !contact.portalEnabled || contact.clientId !== payload.clientId) {
      throw new UnauthorizedException();
    }

    await this.prisma.auditLog.create({
      data: {
        firmId: payload.firmId,
        action: 'CLIENT_PORTAL_ACCESS',
        metadata: { clientContactId: contact.id, path: req.originalUrl },
      },
    });

    return {
      clientContactId: contact.id,
      clientId: contact.clientId,
      firmId: payload.firmId,
      name: contact.name,
      email: contact.email,
    };
  }
}
```

- [ ] **Step 6: Add the guard and the `@CurrentPortalUser()` decorator**

Create `apps/api/src/client-portal/client-portal.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ClientPortalGuard extends AuthGuard('client-portal-jwt') {}
```

Create `apps/api/src/client-portal/current-portal-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PortalIdentity } from './client-portal-jwt.strategy';

export const CurrentPortalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalIdentity => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 7: Add the auth service**

Create `apps/api/src/client-portal/client-portal-auth.service.ts`:

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { EmailService } from '../notifications/email.service';

interface PortalTokenPayload {
  sub: string;
  clientId: string;
  firmId: string;
}

@Injectable()
export class ClientPortalAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  async requestLink(email: string): Promise<{ message: string; linkToken?: string }> {
    const message = 'If that email is registered for portal access, a sign-in link has been sent.';
    const contact = await this.prisma.clientContact.findFirst({
      where: { email, portalEnabled: true },
      include: { client: { include: { firm: true } } },
    });

    if (!contact) {
      return { message };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.clientPortalLoginToken.create({
      data: { clientContactId: contact.id, token, expiresAt },
    });

    await this.prisma.auditLog.create({
      data: {
        firmId: contact.client.firmId,
        action: 'CLIENT_PORTAL_LINK_REQUESTED',
        metadata: { clientContactId: contact.id, email },
      },
    });

    const verifyUrl = `${this.email.getAppUrl()}/portal/verify?token=${token}`;
    await this.email.sendClientPortalMagicLinkEmail({
      to: contact.email!,
      contactName: contact.name,
      firmName: contact.client.firm.name,
      verifyUrl,
      expiresAt,
    });

    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    return { message, linkToken: isDev ? token : undefined };
  }

  async verify(token: string): Promise<{
    accessToken: string;
    contact: { id: string; name: string; email: string | null };
    client: { id: string; name: string };
  }> {
    const record = await this.prisma.clientPortalLoginToken.findUnique({ where: { token } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This sign-in link is invalid or has expired.');
    }

    const contact = await this.prisma.clientContact.findUnique({
      where: { id: record.clientContactId },
      include: { client: true },
    });
    if (!contact || !contact.portalEnabled) {
      throw new BadRequestException('Portal access is no longer available for this contact.');
    }

    await this.prisma.$transaction([
      this.prisma.clientPortalLoginToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          firmId: contact.client.firmId,
          action: 'CLIENT_PORTAL_LOGIN',
          metadata: { clientContactId: contact.id },
        },
      }),
    ]);

    const payload: PortalTokenPayload = {
      sub: contact.id,
      clientId: contact.clientId,
      firmId: contact.client.firmId,
    };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('CLIENT_PORTAL_JWT_SECRET'),
      expiresIn: '7d',
    });

    return {
      accessToken,
      contact: { id: contact.id, name: contact.name, email: contact.email },
      client: { id: contact.client.id, name: contact.client.name },
    };
  }
}
```

- [ ] **Step 8: Add the auth controller**

Create `apps/api/src/client-portal/client-portal-auth.controller.ts`:

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { ClientPortalAuthService } from './client-portal-auth.service';
import { RequestPortalLinkDto, VerifyPortalTokenDto } from './dto/client-portal-auth.dto';
import { SkipSubscription } from '../saas/decorators/saas.decorators';

@Controller('client-portal/auth')
export class ClientPortalAuthController {
  constructor(private authService: ClientPortalAuthService) {}

  @Post('request-link')
  @SkipSubscription()
  requestLink(@Body() dto: RequestPortalLinkDto) {
    return this.authService.requestLink(dto.email);
  }

  @Post('verify')
  @SkipSubscription()
  verify(@Body() dto: VerifyPortalTokenDto) {
    return this.authService.verify(dto.token);
  }
}
```

- [ ] **Step 9: Add the module (auth pieces only — the data controller is added in Task 3)**

Create `apps/api/src/client-portal/client-portal.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ClientPortalAuthService } from './client-portal-auth.service';
import { ClientPortalAuthController } from './client-portal-auth.controller';
import { ClientPortalJwtStrategy } from './client-portal-jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PassportModule.register({}), JwtModule.register({}), NotificationsModule],
  controllers: [ClientPortalAuthController],
  providers: [ClientPortalAuthService, ClientPortalJwtStrategy],
})
export class ClientPortalModule {}
```

- [ ] **Step 10: Register the module in `AppModule`**

In `apps/api/src/app.module.ts`, add the import:

```typescript
import { ClientPortalModule } from './client-portal/client-portal.module';
```

And add `ClientPortalModule` to the `imports` array (after `ClientsModule` reads naturally, but anywhere in the array works — Nest doesn't care about order):

```typescript
    ClientsModule,
    ClientPortalModule,
```

- [ ] **Step 11: Add the env var**

In `apps/api/.env.example`, add this line near `JWT_REFRESH_SECRET`:

```
CLIENT_PORTAL_JWT_SECRET="dev-client-portal-secret-change-in-production"
```

Also add the same line with the same value to your local `apps/api/.env` (not committed) so the dev server picks it up.

- [ ] **Step 12: Verify it builds**

Run: `pnpm --filter api build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 13: Verify the server boots and the routes exist**

Run: `pnpm --filter api dev` in one terminal, wait for `API running on http://0.0.0.0:3001`, then in another terminal:

Run: `curl -s -X POST http://localhost:3001/client-portal/auth/request-link -H "Content-Type: application/json" -d '{"email":"nobody@example.com"}'`
Expected: `{"message":"If that email is registered for portal access, a sign-in link has been sent."}` (no `linkToken` — no contact has `portalEnabled: true` yet, that's added in Task 4/9).

Run: `curl -s -X POST http://localhost:3001/client-portal/auth/verify -H "Content-Type: application/json" -d '{"token":"bogus"}'`
Expected: `{"message":"This sign-in link is invalid or has expired.","error":"Bad Request","statusCode":400}`

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/client-portal apps/api/src/app.module.ts apps/api/.env.example
git commit -m "feat: add client portal magic-link auth (request-link, verify)"
```

---

### Task 3: Client portal data endpoints (cases, case detail, document download)

**Files:**
- Create: `apps/api/src/client-portal/client-portal.service.ts`
- Create: `apps/api/src/client-portal/client-portal.controller.ts`
- Modify: `apps/api/src/client-portal/client-portal.module.ts`

**Interfaces:**
- Consumes: `PortalIdentity` (from Task 2's `client-portal-jwt.strategy.ts`), `ClientPortalGuard` (Task 2), `DocumentsService.getFilePath(documentId, version?)` (existing, `apps/api/src/documents/documents.service.ts`).
- Produces: `GET /client-portal/me`, `GET /client-portal/cases`, `GET /client-portal/cases/:id`, `GET /client-portal/documents/:documentId/download` — Task 8's `portal-api.ts` depends on these four routes and the exact response shapes below.

- [ ] **Step 1: Add the service**

Create `apps/api/src/client-portal/client-portal.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { DocumentsService } from '../documents/documents.service';
import { PortalIdentity } from './client-portal-jwt.strategy';

@Injectable()
export class ClientPortalService {
  constructor(
    private prisma: PrismaService,
    private documentsService: DocumentsService,
  ) {}

  async getMe(portalUser: PortalIdentity) {
    const client = await this.prisma.client.findUnique({
      where: { id: portalUser.clientId },
      select: { id: true, name: true },
    });
    return {
      id: portalUser.clientContactId,
      name: portalUser.name,
      email: portalUser.email,
      client,
    };
  }

  async getCases(portalUser: PortalIdentity) {
    return this.prisma.case.findMany({
      where: { clientId: portalUser.clientId },
      select: {
        id: true,
        ownRef: true,
        title: true,
        status: true,
        courtName: true,
        openedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getCase(portalUser: PortalIdentity, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, clientId: portalUser.clientId },
      select: {
        id: true,
        ownRef: true,
        title: true,
        status: true,
        courtName: true,
        openedAt: true,
      },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const [nextHearing, documents, invoices] = await Promise.all([
      this.prisma.calendarEvent.findFirst({
        where: { caseId, type: 'COURT_DATE', startAt: { gte: new Date() } },
        orderBy: { startAt: 'asc' },
        select: { id: true, title: true, startAt: true },
      }),
      this.prisma.document.findMany({
        where: { caseId, visibleToClient: true },
        select: { id: true, filename: true, mimeType: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { caseId, status: { in: ['SENT', 'PAID'] } },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          issuedAt: true,
          dueAt: true,
          lineItems: {
            select: { id: true, description: true, quantity: true, unitPrice: true, amount: true },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);

    return { ...legalCase, nextHearing, documents, invoices };
  }

  async getVisibleDocumentFile(portalUser: PortalIdentity, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, visibleToClient: true, case: { clientId: portalUser.clientId } },
    });
    if (!document) throw new NotFoundException('Document not found');
    return this.documentsService.getFilePath(documentId);
  }
}
```

- [ ] **Step 2: Add the controller**

Create `apps/api/src/client-portal/client-portal.controller.ts`:

```typescript
import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import { ClientPortalService } from './client-portal.service';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SkipSubscription } from '../saas/decorators/saas.decorators';

@Controller('client-portal')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalController {
  constructor(private portalService: ClientPortalService) {}

  @Get('me')
  getMe(@CurrentPortalUser() portalUser: PortalIdentity) {
    return this.portalService.getMe(portalUser);
  }

  @Get('cases')
  getCases(@CurrentPortalUser() portalUser: PortalIdentity) {
    return this.portalService.getCases(portalUser);
  }

  @Get('cases/:id')
  getCase(@CurrentPortalUser() portalUser: PortalIdentity, @Param('id') id: string) {
    return this.portalService.getCase(portalUser, id);
  }

  @Get('documents/:documentId/download')
  async download(
    @CurrentPortalUser() portalUser: PortalIdentity,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const fileInfo = await this.portalService.getVisibleDocumentFile(portalUser, documentId);
    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
    fs.createReadStream(fileInfo.path).pipe(res);
  }
}
```

- [ ] **Step 3: Wire the new controller/service and `DocumentsModule` into the module**

Modify `apps/api/src/client-portal/client-portal.module.ts` to match:

```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ClientPortalAuthService } from './client-portal-auth.service';
import { ClientPortalAuthController } from './client-portal-auth.controller';
import { ClientPortalService } from './client-portal.service';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalJwtStrategy } from './client-portal-jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PassportModule.register({}), JwtModule.register({}), NotificationsModule, DocumentsModule],
  controllers: [ClientPortalAuthController, ClientPortalController],
  providers: [ClientPortalAuthService, ClientPortalService, ClientPortalJwtStrategy],
})
export class ClientPortalModule {}
```

- [ ] **Step 4: Verify it builds**

Run: `pnpm --filter api build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 5: Verify the guard actually blocks unauthenticated requests**

With the dev server running (`pnpm --filter api dev`):

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/client-portal/cases`
Expected: `401`

(A full authenticated walkthrough of `/client-portal/me`, `/cases`, `/cases/:id`, and the document download happens in Task 9, once a `portalEnabled` contact and a `visibleToClient` document exist to test against.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/client-portal
git commit -m "feat: add client portal data endpoints (cases, case detail, document download)"
```

---

### Task 4: Staff-side — enable portal access per contact

**Files:**
- Modify: `apps/api/src/clients/dto/client.dto.ts`
- Modify: `apps/api/src/clients/clients.service.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ClientContactDto.portalEnabled?: boolean` accepted by the existing `POST /clients` and `PATCH /clients/:id` endpoints — Task 8's `updateClient` frontend call depends on this field round-tripping.

- [ ] **Step 1: Add `portalEnabled` to the DTO**

In `apps/api/src/clients/dto/client.dto.ts`, add to `ClientContactDto` (after `isPrimary`):

```typescript
  @IsOptional()
  @IsBoolean()
  portalEnabled?: boolean;
```

- [ ] **Step 2: Persist it on create and update**

In `apps/api/src/clients/clients.service.ts`, in `create()`, change the `contacts.map` block to:

```typescript
        contacts: {
          create: contacts.map((c, i) => ({
            name: c.name,
            email: c.email,
            phone: c.phone,
            position: c.position,
            isPrimary: c.isPrimary ?? i === 0,
            portalEnabled: c.portalEnabled ?? false,
          })),
        },
```

In `update()`, change the `createMany` block to:

```typescript
        await tx.clientContact.createMany({
          data: dto.contacts.map((c, i) => ({
            clientId: id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            position: c.position,
            isPrimary: c.isPrimary ?? i === 0,
            portalEnabled: c.portalEnabled ?? false,
          })),
        });
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm --filter api build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 4: Verify end-to-end with curl**

With the dev server running and a valid staff `accessToken` (log in via `POST /auth/login` with one of the seeded demo accounts — see `apps/api/prisma/seed.ts` for credentials), get an existing client id via `GET /clients`, then:

Run:
```bash
curl -s -X PATCH http://localhost:3001/clients/<CLIENT_ID> \
  -H "Authorization: Bearer <STAFF_TOKEN>" -H "Content-Type: application/json" \
  -d '{"contacts":[{"name":"John Smith","email":"john.smith@email.com","phone":"081-234-5678","isPrimary":true,"portalEnabled":true}]}'
```
Expected: the response JSON's `contacts[0]` includes `"portalEnabled":true`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/clients
git commit -m "feat: let staff enable client portal access per contact"
```

---

### Task 5: Staff-side — mark documents visible to client

**Files:**
- Create: `apps/api/src/documents/dto/update-visibility.dto.ts`
- Modify: `apps/api/src/documents/documents.service.ts`
- Modify: `apps/api/src/documents/documents.controller.ts`

**Interfaces:**
- Produces: `PATCH /cases/:caseId/documents/:documentId/visibility` — Task 8's frontend depends on this exact route (nested under `caseId` so the existing `CaseAccessGuard` on the controller keeps working unchanged).

- [ ] **Step 1: Add the DTO**

Create `apps/api/src/documents/dto/update-visibility.dto.ts`:

```typescript
import { IsBoolean } from 'class-validator';

export class UpdateDocumentVisibilityDto {
  @IsBoolean()
  visibleToClient!: boolean;
}
```

- [ ] **Step 2: Add the service method**

In `apps/api/src/documents/documents.service.ts`, add this method (after `getFilePath`):

```typescript
  async updateVisibility(documentId: string, visibleToClient: boolean) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');
    return this.prisma.document.update({
      where: { id: documentId },
      data: { visibleToClient },
    });
  }
```

- [ ] **Step 3: Add the controller route**

In `apps/api/src/documents/documents.controller.ts`, update the imports:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Query,
} from '@nestjs/common';
```

Add this import for the new DTO:

```typescript
import { UpdateDocumentVisibilityDto } from './dto/update-visibility.dto';
```

Add this route (after `uploadVersion`, before `download`):

```typescript
  @Patch(':documentId/visibility')
  updateVisibility(
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDocumentVisibilityDto,
  ) {
    return this.documentsService.updateVisibility(documentId, dto.visibleToClient);
  }
```

- [ ] **Step 4: Verify it builds**

Run: `pnpm --filter api build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 5: Verify end-to-end with curl**

Using a staff token and an existing `caseId`/`documentId` (upload one first via the dashboard if none exist yet):

Run:
```bash
curl -s -X PATCH http://localhost:3001/cases/<CASE_ID>/documents/<DOCUMENT_ID>/visibility \
  -H "Authorization: Bearer <STAFF_TOKEN>" -H "Content-Type: application/json" \
  -d '{"visibleToClient":true}'
```
Expected: response JSON includes `"visibleToClient":true`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/documents
git commit -m "feat: let staff mark documents visible to the client portal"
```

---

### Task 6: Frontend — portal API client and auth context

**Files:**
- Create: `apps/web/src/lib/portal-api.ts`
- Create: `apps/web/src/lib/portal-auth.tsx`

**Interfaces:**
- Consumes: `POST /client-portal/auth/request-link`, `POST /client-portal/auth/verify`, `GET /client-portal/me`, `GET /client-portal/cases`, `GET /client-portal/cases/:id`, `GET /client-portal/documents/:documentId/download` (Tasks 2–3).
- Produces: `portalApi` object, `PortalApiError`, `PortalContact`, `PortalCaseSummary`, `PortalCaseDetail` types, `PortalAuthProvider`, `usePortalAuth()` — Task 7's pages depend on all of these exact names and shapes.

- [ ] **Step 1: Add the portal API client**

Create `apps/web/src/lib/portal-api.ts`:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function parseApiErrorMessage(body: unknown, fallback: string): string {
  const payload = body as { message?: string | { message?: string } };
  if (typeof payload.message === 'string') return payload.message;
  if (payload.message && typeof payload.message === 'object' && payload.message.message) {
    return payload.message.message;
  }
  return fallback;
}

export class PortalApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers, cache: 'no-store' });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PortalApiError(res.status, parseApiErrorMessage(body, res.statusText));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function requestBlob(path: string, token: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PortalApiError(res.status, parseApiErrorMessage(body, res.statusText));
  }
  return res.blob();
}

export interface PortalContact {
  id: string;
  name: string;
  email: string | null;
  client: { id: string; name: string } | null;
}

export interface PortalCaseSummary {
  id: string;
  ownRef: string;
  title: string;
  status: string;
  courtName: string | null;
  openedAt: string;
}

export interface PortalCaseDetail extends PortalCaseSummary {
  nextHearing: { id: string; title: string; startAt: string } | null;
  documents: Array<{ id: string; filename: string; mimeType: string; createdAt: string }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    totalAmount: number;
    issuedAt: string | null;
    dueAt: string | null;
    lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; amount: number }>;
  }>;
}

export const portalApi = {
  requestLink: (email: string) =>
    request<{ message: string; linkToken?: string }>('/client-portal/auth/request-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verify: (token: string) =>
    request<{
      accessToken: string;
      contact: { id: string; name: string; email: string | null };
      client: { id: string; name: string };
    }>('/client-portal/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }),

  getMe: (token: string) => request<PortalContact>('/client-portal/me', { token }),

  getCases: (token: string) => request<PortalCaseSummary[]>('/client-portal/cases', { token }),

  getCase: (token: string, id: string) =>
    request<PortalCaseDetail>(`/client-portal/cases/${id}`, { token }),

  downloadDocument: (token: string, documentId: string) =>
    requestBlob(`/client-portal/documents/${documentId}/download`, token),
};
```

- [ ] **Step 2: Add the portal auth context**

Create `apps/web/src/lib/portal-auth.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { portalApi, PortalContact } from './portal-api';

const TOKEN_KEY = 'lawfirm_portal_access_token';

interface PortalAuthContextValue {
  contact: PortalContact | null;
  token: string | null;
  loading: boolean;
  setSession: (accessToken: string) => Promise<void>;
  logout: () => void;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [contact, setContact] = useState<PortalContact | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      portalApi
        .getMe(stored)
        .then((c) => {
          setContact(c);
          setToken(stored);
        })
        .catch(() => localStorage.removeItem(TOKEN_KEY))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const setSession = useCallback(async (accessToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    const c = await portalApi.getMe(accessToken);
    setToken(accessToken);
    setContact(c);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setContact(null);
  }, []);

  return (
    <PortalAuthContext.Provider value={{ contact, token, loading, setSession, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider');
  return ctx;
}
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm --filter web build`
Expected: build completes with no TypeScript errors (unused-file warnings are fine — nothing imports these two files yet, that happens in Task 7).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/portal-api.ts apps/web/src/lib/portal-auth.tsx
git commit -m "feat: add client portal frontend API client and auth context"
```

---

### Task 7: Frontend — portal pages

**Files:**
- Create: `apps/web/src/app/(client-portal)/portal/layout.tsx`
- Create: `apps/web/src/app/(client-portal)/portal/login/page.tsx`
- Create: `apps/web/src/app/(client-portal)/portal/check-email/page.tsx`
- Create: `apps/web/src/app/(client-portal)/portal/verify/page.tsx`
- Create: `apps/web/src/app/(client-portal)/portal/page.tsx`
- Create: `apps/web/src/app/(client-portal)/portal/cases/[id]/page.tsx`

**Interfaces:**
- Consumes: `portalApi`, `PortalApiError`, `PortalCaseSummary`, `PortalCaseDetail` (Task 6's `lib/portal-api.ts`); `PortalAuthProvider`, `usePortalAuth()` (Task 6's `lib/portal-auth.tsx`); `Button`, `Input`, `Card`/`CardContent`, `Badge` (existing, `@/components/ui/*`).

- [ ] **Step 1: Add the portal layout**

Create `apps/web/src/app/(client-portal)/portal/layout.tsx`:

```tsx
import { PortalAuthProvider } from '@/lib/portal-auth';

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalAuthProvider>{children}</PortalAuthProvider>;
}
```

- [ ] **Step 2: Add the login page**

Create `apps/web/src/app/(client-portal)/portal/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scale } from 'lucide-react';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await portalApi.requestLink(email);
      router.push('/portal/check-email');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="p-8">
          <div className="mb-8 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">LexFlow — Client Portal</span>
          </div>
          <h2 className="mb-1 text-xl font-semibold">Check your case online</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Enter the email your lawyer has on file. We&apos;ll send you a sign-in link — no password needed.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="mt-1"
                required
              />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Sending link...' : 'Send me a sign-in link'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add the check-email page**

Create `apps/web/src/app/(client-portal)/portal/check-email/page.tsx`:

```tsx
import { Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function PortalCheckEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            If that email is registered for portal access, we&apos;ve sent a sign-in link. It expires in 15 minutes
            and can only be used once.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Add the verify page**

Create `apps/web/src/app/(client-portal)/portal/verify/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { Card, CardContent } from '@/components/ui/card';

export default function PortalVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = usePortalAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('Missing sign-in link. Please request a new one.');
      return;
    }
    portalApi
      .verify(token)
      .then((res) => setSession(res.accessToken))
      .then(() => router.replace('/portal'))
      .catch((err) => {
        setError(err instanceof PortalApiError ? err.message : 'This link is invalid or has expired.');
      });
  }, [searchParams, setSession, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="p-8 text-center">
          {error ? (
            <>
              <p className="mb-4 text-sm text-destructive">{error}</p>
              <Link href="/portal/login" className="text-sm text-primary hover:underline">
                Request a new link
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Signing you in...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Add the case list (dashboard) page**

Create `apps/web/src/app/(client-portal)/portal/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseSummary } from '@/lib/portal-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function PortalDashboardPage() {
  const { contact, token, loading, logout } = usePortalAuth();
  const router = useRouter();
  const [cases, setCases] = useState<PortalCaseSummary[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);

  useEffect(() => {
    if (!loading && !contact) {
      router.replace('/portal/login');
    }
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token) return;
    portalApi
      .getCases(token)
      .then(setCases)
      .finally(() => setLoadingCases(false));
  }, [token]);

  if (loading || !contact) return null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome, {contact.name}</h1>
            <p className="text-sm text-muted-foreground">{contact.client?.name}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>

        {loadingCases ? (
          <p className="text-muted-foreground">Loading your cases...</p>
        ) : cases.length === 0 ? (
          <p className="text-muted-foreground">No cases to show yet.</p>
        ) : (
          <div className="space-y-3">
            {cases.map((c) => (
              <Card
                key={c.id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => router.push(`/portal/cases/${c.id}`)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.ownRef}
                      {c.courtName ? ` · ${c.courtName}` : ''}
                    </p>
                  </div>
                  <Badge>{c.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add the case detail page**

Create `apps/web/src/app/(client-portal)/portal/cases/[id]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseDetail } from '@/lib/portal-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function PortalCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<PortalCaseDetail | null>(null);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token || !id) return;
    portalApi
      .getCase(token, id)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [token, id]);

  const handleDownload = async (documentId: string, filename: string) => {
    if (!token) return;
    const blob = await portalApi.downloadDocument(token, documentId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !contact || !detail) return null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/portal" className="text-sm text-primary hover:underline">
          ← All cases
        </Link>
        <div className="mt-2 mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{detail.title}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.ownRef}
              {detail.courtName ? ` · ${detail.courtName}` : ''}
            </p>
          </div>
          <Badge>{detail.status}</Badge>
        </div>

        <Card className="mb-4">
          <CardContent className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Next hearing</h2>
            {detail.nextHearing ? (
              <p className="text-sm">
                {detail.nextHearing.title} — {new Date(detail.nextHearing.startAt).toLocaleString()}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming hearing scheduled.</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Documents</h2>
            {detail.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents shared yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.documents.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleDownload(d.id, d.filename)}
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent/50"
                  >
                    <span>{d.filename}</span>
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Invoices</h2>
            {detail.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.dueAt ? `Due ${new Date(inv.dueAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">฿{inv.totalAmount.toLocaleString()}</p>
                      <Badge variant={inv.status === 'PAID' ? 'success' : 'warning'}>{inv.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify it builds**

Run: `pnpm --filter web build`
Expected: build completes with no TypeScript errors, and the build output lists the new routes: `/portal`, `/portal/login`, `/portal/check-email`, `/portal/verify`, `/portal/cases/[id]`.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/(client-portal)"
git commit -m "feat: add client portal pages (login, verify, case list, case detail)"
```

---

### Task 8: Frontend — staff-side toggles

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/(dashboard)/clients/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/documents/page.tsx`

**Interfaces:**
- Consumes: `PATCH /clients/:id` with `contacts[].portalEnabled` (Task 4), `PATCH /cases/:caseId/documents/:documentId/visibility` (Task 5).

- [ ] **Step 1: Extend `api.ts` types and add the visibility call**

In `apps/web/src/lib/api.ts`, update `ClientContactItem` to add the new field:

```typescript
export interface ClientContactItem {
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  isPrimary?: boolean;
  portalEnabled?: boolean;
}
```

Update `DocumentItem` to add the new field:

```typescript
export interface DocumentItem {
  id: string;
  filename: string;
  mimeType: string;
  version: number;
  visibleToClient: boolean;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string };
}
```

Add this to the `api` object (after `downloadDocument`):

```typescript
  updateDocumentVisibility: (token: string, caseId: string, documentId: string, visibleToClient: boolean) =>
    request<DocumentItem>(`/cases/${caseId}/documents/${documentId}/visibility`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ visibleToClient }),
    }),
```

- [ ] **Step 2: Add the portal-access toggle to the client detail Contacts tab**

In `apps/web/src/app/(dashboard)/clients/page.tsx`, add this import:

```typescript
import { Button } from '@/components/ui/button';
```

Add this function inside `ClientsPage`, near `load`:

```typescript
  const togglePortalAccess = async (contactId: string, next: boolean) => {
    if (!token || !selected) return;
    const updatedContacts = selected.contacts.map((c) =>
      c.id === contactId ? { ...c, portalEnabled: next } : c,
    );
    const updated = await api.updateClient(token, selected.id, { contacts: updatedContacts });
    setSelected(updated);
  };
```

In the `TabsContent value="contacts"` block, change the `CardContent` for each contact to add the toggle button — replace:

```tsx
                <Card key={c.id ?? i}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {c.name}
                        {c.isPrimary && <span className="ml-2 text-xs text-primary">(Primary)</span>}
                      </p>
                      {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                      <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                        {c.email && <p>{c.email}</p>}
                        {c.phone && <p>{c.phone}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
```

with:

```tsx
                <Card key={c.id ?? i}>
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {c.name}
                          {c.isPrimary && <span className="ml-2 text-xs text-primary">(Primary)</span>}
                        </p>
                        {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                        <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                          {c.email && <p>{c.email}</p>}
                          {c.phone && <p>{c.phone}</p>}
                        </div>
                      </div>
                    </div>
                    {c.id && c.email && (
                      <Button
                        size="sm"
                        variant={c.portalEnabled ? 'default' : 'outline'}
                        onClick={() => togglePortalAccess(c.id!, !c.portalEnabled)}
                      >
                        {c.portalEnabled ? 'Portal enabled' : 'Enable portal'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
```

(The button only renders when the contact has an email, since portal login requires one.)

- [ ] **Step 3: Add the visibility toggle to the case documents page**

In `apps/web/src/app/(dashboard)/cases/[id]/documents/page.tsx`, add this function inside `CaseDocumentsPage`, near `handleDownload`:

```typescript
  const handleToggleVisibility = async (doc: DocumentItem) => {
    if (!token || !id) return;
    try {
      await api.updateDocumentVisibility(token, id, doc.id, !doc.visibleToClient);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update visibility');
    }
  };
```

In the file list, change the `div` with `className="flex shrink-0 items-center gap-2"` to add the toggle — replace:

```tsx
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-xs text-slate-400 sm:inline">{d.mimeType}</span>
                <button
                  type="button"
                  onClick={() => handleView(d)}
                  disabled={viewingId === d.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-white disabled:opacity-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {viewingId === d.id ? 'Opening...' : 'View'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(d)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
```

with:

```tsx
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-xs text-slate-400 sm:inline">{d.mimeType}</span>
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(d)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    d.visibleToClient
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 hover:bg-white'
                  }`}
                >
                  {d.visibleToClient ? 'Visible to client' : 'Hidden from client'}
                </button>
                <button
                  type="button"
                  onClick={() => handleView(d)}
                  disabled={viewingId === d.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-white disabled:opacity-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {viewingId === d.id ? 'Opening...' : 'View'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(d)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
```

- [ ] **Step 4: Verify it builds**

Run: `pnpm --filter web build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts "apps/web/src/app/(dashboard)/clients/page.tsx" "apps/web/src/app/(dashboard)/cases/[id]/documents/page.tsx"
git commit -m "feat: add staff-side toggles for client portal access and document visibility"
```

---

### Task 9: Seed data and full manual walkthrough

**Files:**
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–8. This task has no new production code — it seeds one ready-to-test contact and walks the entire flow end-to-end.

- [ ] **Step 1: Enable portal access for one seeded contact**

In `apps/api/prisma/seed.ts`, find the `clientSmith` creation block and change `John Smith`'s contact entry to:

```typescript
          { name: 'John Smith', email: 'john.smith@email.com', phone: '081-234-5678', isPrimary: true, portalEnabled: true },
```

(Only this one line changes — `Jane Smith` and the ABC Corporation contacts stay as they are, so there's a clear contrast between a portal-enabled and a portal-disabled contact for manual testing.)

- [ ] **Step 2: Re-run the seed**

Run: `pnpm db:seed`
Expected: script completes without error, ending with whatever success line the existing seed script prints.

- [ ] **Step 3: Commit the seed change**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat: seed a portal-enabled client contact for testing"
```

- [ ] **Step 4: Full manual walkthrough — request and verify a magic link**

With `pnpm --filter api dev` and `pnpm --filter web dev` both running:

Run: `curl -s -X POST http://localhost:3001/client-portal/auth/request-link -H "Content-Type: application/json" -d '{"email":"john.smith@email.com"}'`
Expected: JSON response containing `"message"` and, because `NODE_ENV` is not `production` in local dev, a `"linkToken"` field with a long hex string. Copy that token.

- [ ] **Step 5: Exchange the token and confirm the portal user shape**

Run: `curl -s -X POST http://localhost:3001/client-portal/auth/verify -H "Content-Type: application/json" -d '{"token":"<TOKEN_FROM_STEP_4>"}'`
Expected: JSON with `accessToken`, `contact.name` = `"John Smith"`, `client.name` = `"John Smith"` (the seeded client is named after the individual).

- [ ] **Step 6: Confirm case scoping works**

Using the `accessToken` from Step 5:

Run: `curl -s http://localhost:3001/client-portal/cases -H "Authorization: Bearer <ACCESS_TOKEN>"`
Expected: a JSON array containing only cases whose `clientId` belongs to the John Smith client — cross-check against `GET /clients/<john-smith-client-id>` (with a staff token) to confirm the case count matches.

- [ ] **Step 7: Confirm the browser flow end-to-end**

1. Open `http://localhost:3000/portal/login` in a browser.
2. Enter `john.smith@email.com`, submit. You should land on `/portal/check-email`.
3. Since SendGrid likely isn't configured locally, use the `linkToken` from Step 4 directly: navigate to `http://localhost:3000/portal/verify?token=<TOKEN>`.
4. You should land on `/portal` showing "Welcome, John Smith" and a list of cases (or "No cases to show yet" if none are linked to this client).
5. As a staff user, go to a case's Documents tab, upload a file if none exists, and click "Hidden from client" to toggle it to "Visible to client".
6. Reload the client portal case detail page for that case (`/portal/cases/<id>`) — the document should now appear under "Documents" and be downloadable.
7. As staff, go to `/clients`, open the John Smith client, Contacts tab, and click "Portal enabled" to turn it off.
8. Request a new magic link for `john.smith@email.com` — the response should have no `linkToken` (contact is no longer `portalEnabled`), confirming the toggle takes effect immediately.

- [ ] **Step 8: Confirm the audit trail**

Run (with a staff token, replace `<FIRM_ID>` with the seeded demo firm's id from `GET /auth/me`):
```bash
curl -s http://localhost:3001/client-portal/cases -H "Authorization: Bearer <ACCESS_TOKEN_FROM_STEP_5>" > /dev/null
```
Then check the database directly:
```bash
pnpm --filter api prisma studio
```
Open the `AuditLog` table and confirm rows exist with `action` values `CLIENT_PORTAL_LINK_REQUESTED`, `CLIENT_PORTAL_LOGIN`, and `CLIENT_PORTAL_ACCESS`.

This is the final task — once Step 7 and Step 8 both check out, the feature is complete and working end-to-end.
