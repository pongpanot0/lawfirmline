"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceStatus = exports.EventType = exports.AssignmentType = exports.TaskStatus = exports.CaseStatus = exports.Role = void 0;
var Role;
(function (Role) {
    Role["ADMIN"] = "ADMIN";
    Role["LAWYER"] = "LAWYER";
    Role["CLERK"] = "CLERK";
})(Role || (exports.Role = Role = {}));
var CaseStatus;
(function (CaseStatus) {
    CaseStatus["OPEN"] = "OPEN";
    CaseStatus["IN_PROGRESS"] = "IN_PROGRESS";
    CaseStatus["PENDING"] = "PENDING";
    CaseStatus["CLOSED"] = "CLOSED";
})(CaseStatus || (exports.CaseStatus = CaseStatus = {}));
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["TODO"] = "TODO";
    TaskStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TaskStatus["DONE"] = "DONE";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
var AssignmentType;
(function (AssignmentType) {
    AssignmentType["LEAD"] = "LEAD";
    AssignmentType["CO_COUNSEL"] = "CO_COUNSEL";
    AssignmentType["CLERK"] = "CLERK";
})(AssignmentType || (exports.AssignmentType = AssignmentType = {}));
var EventType;
(function (EventType) {
    EventType["COURT_DATE"] = "COURT_DATE";
    EventType["CLIENT_MEETING"] = "CLIENT_MEETING";
    EventType["DEADLINE"] = "DEADLINE";
    EventType["OTHER"] = "OTHER";
})(EventType || (exports.EventType = EventType = {}));
var InvoiceStatus;
(function (InvoiceStatus) {
    InvoiceStatus["DRAFT"] = "DRAFT";
    InvoiceStatus["SENT"] = "SENT";
    InvoiceStatus["PAID"] = "PAID";
})(InvoiceStatus || (exports.InvoiceStatus = InvoiceStatus = {}));
//# sourceMappingURL=index.js.map