import { IsString, IsOptional, IsArray, IsNumber, Min, Max, IsBoolean, IsUUID, IsDateString } from 'class-validator';
import { WorkflowStepDefinition, FirmRole } from '@lawfirm/shared';

export class CreateWorkflowTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  steps: WorkflowStepDefinition[];
}

export class UpdateWorkflowTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  steps?: WorkflowStepDefinition[];
}

export class CreateWorkflowRunDto {
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsArray()
  steps?: WorkflowStepDefinition[];

  @IsString()
  name: string;

  @IsOptional()
  @IsDateString()
  promisedAt?: string;

  /** Person per step index; steps left out are auto-assigned by role and load. */
  @IsOptional()
  @IsArray()
  assignees?: Array<string | null>;
}

export class WorkflowAssigneeDto {
  @IsUUID()
  userId: string;

  @IsString()
  name: string;

  @IsNumber()
  openTaskCount: number;
}

export class SendBackWorkflowDto {
  @IsNumber()
  @Min(0)
  toStep: number;

  @IsString()
  reason: string;
}

export class WorkflowRunDetailDto {
  id: string;
  name: string;
  status: string;
  promisedAt?: string;
  case: {
    id: string;
    ownRef: string;
    title: string;
  };
  currentStep?: {
    index: number;
    title: string;
    assignee?: {
      id: string;
      name: string;
    };
    dueDate?: string;
  };
  stepsDone: number;
  stepsTotal: number;
  projectedFinish?: string;
  lateByDays?: number;
}

export class ExternalStepInputDto {
  attachmentId: string;
  filename: string;
  size: number;
  step: number;
}

export class ExternalStepOutputDto {
  attachmentId: string;
  filename: string;
  size: number;
}

export class ExternalStepDto {
  taskId: string;
  title: string;
  instructions?: string;
  status: string;
  dueDate?: string;
  blocked: boolean;
  run: {
    name: string;
    caseRef: string;
  };
  inputs: ExternalStepInputDto[];
  outputs: ExternalStepOutputDto[];
}
