import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { FirmRoles } from '../saas/decorators/saas.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { WorkflowsService } from './workflows.service';
import {
  CreateWorkflowTemplateDto,
  UpdateWorkflowTemplateDto,
  CreateWorkflowRunDto,
  SendBackWorkflowDto,
} from './dto/workflow.dto';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(private workflowsService: WorkflowsService) {}

  // ===== Templates (OWNER/SENIOR only) =====

  @Get('templates')
  async getTemplates(@CurrentUser() user: AuthUser) {
    return this.workflowsService.getTemplates(user);
  }

  @Post('templates')
  @UseGuards(FirmRoleGuard)
  @FirmRoles(FirmRole.OWNER, FirmRole.SENIOR_LAWYER)
  async createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWorkflowTemplateDto,
  ) {
    return this.workflowsService.createTemplate(user, dto);
  }

  @Patch('templates/:id')
  @UseGuards(FirmRoleGuard)
  @FirmRoles(FirmRole.OWNER, FirmRole.SENIOR_LAWYER)
  async updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') templateId: string,
    @Body() dto: UpdateWorkflowTemplateDto,
  ) {
    return this.workflowsService.updateTemplate(user, templateId, dto);
  }

  @Delete('templates/:id')
  @UseGuards(FirmRoleGuard)
  @FirmRoles(FirmRole.OWNER, FirmRole.SENIOR_LAWYER)
  async deleteTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') templateId: string,
  ) {
    return this.workflowsService.deleteTemplate(user, templateId);
  }

  // ===== Assignee Picker =====

  @Get('assignees')
  async getAssignees(@CurrentUser() user: AuthUser, @Query('role') role: FirmRole) {
    return this.workflowsService.getAssigneesByRole(user, role);
  }

  // ===== Workflow Runs =====

  @Get('runs')
  async getWorkflowRuns(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.workflowsService.getWorkflowRuns(user, status);
  }

  @Get('runs/:id/files')
  async getRunFiles(@CurrentUser() user: AuthUser, @Param('id') runId: string) {
    return this.workflowsService.getRunFiles(user, runId);
  }

  @Post('runs/:id/send-back')
  async sendBack(
    @CurrentUser() user: AuthUser,
    @Param('id') runId: string,
    @Body() dto: SendBackWorkflowDto,
  ) {
    return this.workflowsService.sendBack(user, runId, dto);
  }

  @Post('runs/:id/cancel')
  async cancelRun(@CurrentUser() user: AuthUser, @Param('id') runId: string) {
    return this.workflowsService.cancelRun(user, runId);
  }
}

@Controller('cases/:caseId/workflows')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseWorkflowsController {
  constructor(private workflowsService: WorkflowsService) {}

  @Get()
  async getCaseWorkflows(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
  ) {
    return this.workflowsService.getCaseWorkflows(user, caseId);
  }

  @Post()
  async createWorkflowRun(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateWorkflowRunDto,
  ) {
    return this.workflowsService.createWorkflowRun(user, caseId, dto);
  }
}
