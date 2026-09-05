export enum FlowType {
  CASE = 'CASE',
  TASK = 'TASK',
  TODO = 'TODO',
}

export enum ConversationStep {
  SELECT_ACTION = 'SELECT_ACTION',

  CASE_TITLE = 'CASE_TITLE',
  CASE_CLIENT_SEARCH = 'CASE_CLIENT_SEARCH',
  CASE_CLIENT_PICK = 'CASE_CLIENT_PICK',
  CASE_DESCRIPTION = 'CASE_DESCRIPTION',
  CASE_ASSIGNEE_PICK = 'CASE_ASSIGNEE_PICK',
  CASE_ASSIGNEE_ADD_MORE = 'CASE_ASSIGNEE_ADD_MORE',
  CASE_DEADLINE = 'CASE_DEADLINE',
  CASE_CONFIRM = 'CASE_CONFIRM',
  CASE_EDIT_PICK_FIELD = 'CASE_EDIT_PICK_FIELD',
  CASE_EDIT_VALUE = 'CASE_EDIT_VALUE',

  TASK_CASE_SEARCH = 'TASK_CASE_SEARCH',
  TASK_CASE_PICK = 'TASK_CASE_PICK',
  TASK_TITLE = 'TASK_TITLE',
  TASK_ASSIGNEE_PICK = 'TASK_ASSIGNEE_PICK',
  TASK_DUE_DATE = 'TASK_DUE_DATE',
  TASK_CONFIRM = 'TASK_CONFIRM',
  TASK_EDIT_PICK_FIELD = 'TASK_EDIT_PICK_FIELD',
  TASK_EDIT_VALUE = 'TASK_EDIT_VALUE',

  TODO_TITLE = 'TODO_TITLE',
  TODO_ASSIGNEE_PICK = 'TODO_ASSIGNEE_PICK',
  TODO_DUE_DATE = 'TODO_DUE_DATE',
  TODO_CONFIRM = 'TODO_CONFIRM',
  TODO_EDIT_PICK_FIELD = 'TODO_EDIT_PICK_FIELD',
  TODO_EDIT_VALUE = 'TODO_EDIT_VALUE',
}

export interface ConversationTarget {
  replyToken?: string;
  sourceType: 'user' | 'group' | 'room';
  groupId?: string;
  roomId?: string;
}

export interface SearchResultItem {
  id: string;
  label: string;
}

export interface ConversationSession {
  lineUserId: string;
  userId: string;
  firmId: string;
  flowType: FlowType | null;
  step: ConversationStep;
  data: Record<string, unknown>;
  searchResults?: SearchResultItem[];
  pagingOffset?: number;
  editingField?: string;
  target: ConversationTarget;
  createdAt: number;
  updatedAt: number;
}
