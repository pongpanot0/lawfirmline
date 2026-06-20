export declare enum Role {
    ADMIN = "ADMIN",
    LAWYER = "LAWYER",
    CLERK = "CLERK"
}
export declare enum CaseStatus {
    OPEN = "OPEN",
    IN_PROGRESS = "IN_PROGRESS",
    PENDING = "PENDING",
    CLOSED = "CLOSED"
}
export declare enum TaskStatus {
    TODO = "TODO",
    IN_PROGRESS = "IN_PROGRESS",
    DONE = "DONE"
}
export declare enum AssignmentType {
    LEAD = "LEAD",
    CO_COUNSEL = "CO_COUNSEL",
    CLERK = "CLERK"
}
export declare enum EventType {
    COURT_DATE = "COURT_DATE",
    CLIENT_MEETING = "CLIENT_MEETING",
    DEADLINE = "DEADLINE",
    OTHER = "OTHER"
}
export declare enum InvoiceStatus {
    DRAFT = "DRAFT",
    SENT = "SENT",
    PAID = "PAID"
}
export interface AuthUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
}
export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
}
