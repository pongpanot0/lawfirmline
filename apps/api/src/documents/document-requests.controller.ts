import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { AuthUser, DocRequestStatus } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DocumentsService } from './documents.service';

export class DocumentRequestDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) requestedFrom?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsDateString() dueDate?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() required?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsEnum(DocRequestStatus) status?: DocRequestStatus;
  @IsOptional() @IsUUID() documentId?: string | null;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class DocumentRequestsController {
  constructor(private documents: DocumentsService) {}

  @Get('document-requests')
  list(@CurrentUser() user: AuthUser) { return this.documents.listRequests(user); }

  @Get('cases/:caseId/document-requests')
  listCase(@CurrentUser() user: AuthUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.documents.listRequests(user, caseId);
  }

  @Post('cases/:caseId/document-requests')
  create(@CurrentUser() user: AuthUser, @Param('caseId', ParseUUIDPipe) caseId: string, @Body() dto: DocumentRequestDto) {
    return this.documents.saveRequest(user, caseId, dto);
  }

  @Patch('cases/:caseId/document-requests/:id')
  update(@CurrentUser() user: AuthUser, @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: DocumentRequestDto) {
    return this.documents.saveRequest(user, caseId, dto, id);
  }
}
