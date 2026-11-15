import { PLAN_CONFIG, SubscriptionPlan } from '@lawfirm/shared';
import type { FeatureKey, FeaturePage } from './features';

/*
 * English copy for the /en marketing pages. Same facts as the Thai copy in features.ts
 * (docs/seo/2026-11-15-landing-pages-fact-sheet.md); do not add claims here that the Thai side lacks.
 * Glossary: คำให้การ = statement of defence · บัญชีระบุพยาน = witness list · สืบพยาน = witness hearing ·
 * ทุนทรัพย์ = amount in dispute · ค่าวิชาชีพ = professional fees · หัก ณ ที่จ่าย = withholding tax ·
 * ป.วิ.พ. = Civil Procedure Code · ธุรการ = office staff · ลูกความ = client.
 */

export const stageCopyEn: Record<FeatureKey, { label: string; line: string }> = {
  cases: {
    label: 'Open the case file',
    line: 'Case details, documents and every update sit on one page. Search by client name or case number.',
  },
  calendar: {
    label: 'Court dates and team calendar',
    line: 'Hearings, meetings and leave for the whole team in one calendar, so you know who is in court before you accept a new date.',
  },
  deadlines: {
    label: 'Case deadlines',
    line: 'Samnuan suggests due dates by case type, skipping weekends and Thai public holidays. A lawyer reviews and confirms each one.',
  },
  team: {
    label: 'Assign work to the team',
    line: 'Every task has an owner and a due date, so partners see where work is stuck without asking around.',
  },
  portal: {
    label: 'Keep clients updated',
    line: 'Clients check case status, hearing dates and documents in the portal instead of calling the office every day.',
  },
  billing: {
    label: 'Invoices and payments',
    line: 'Invoice straight from the case file. Litigation and advisory VAT are split for you, withholding tax is recorded on payment, and every instalment gets a receipt.',
  },
};

export const pagesEn: Record<FeatureKey, FeaturePage> = {
  calendar: {
    crumb: 'Court calendar',
    h1: "See the whole team's|court dates in one calendar",
    lead: 'Hearings, meetings and leave for everyone in one place. See who is in court on which day before you accept a new date or assign work.',
    plan: `The court calendar is on every plan · Team availability starts on the ${PLAN_CONFIG[SubscriptionPlan.TEAM].name} plan`,
    quote:
      'Each lawyer keeps hearings in their own diary, and we only find out about a clash after the date is booked.',
    details: [
      [
        'Every appointment in one place',
        'Hearings, client meetings and leave share one calendar, colour-coded by type.',
      ],
      [
        'Linked to the case file',
        'Add a hearing from the case page, so every date shows the case, the court and who is responsible.',
      ],
      [
        'Travel time to court',
        'Samnuan works out the travel time to court, so back-to-back hearings are planned without guessing.',
      ],
    ],
    faq: [
      [
        'Does every lawyer see the same calendar?',
        "Yes. Everyone on the team sees each other's hearings and leave, within the permissions you set.",
      ],
      [
        'Can I check it on my phone?',
        'Yes. While you wait at court, open your next hearing and the case details from your phone.',
      ],
    ],
    cta: "Put your team's court dates in one place",
  },
  deadlines: {
    crumb: 'Case deadlines',
    h1: 'Never miss a filing deadline,|even over long holidays',
    lead: 'Samnuan suggests the due date by case type, counting past weekends and Thai public holidays. A lawyer then reviews and confirms it.',
    plan: '',
    quote:
      'We count the days for the statement of defence by hand, then check whether the last day falls on a holiday.',
    details: [
      [
        'Samnuan suggests, the lawyer confirms',
        'Every due date is a suggestion. A lawyer reviews and confirms it before it goes on the calendar; Samnuan never sets it alone.',
      ],
      [
        'Thai public holidays built in',
        'Periods are counted past weekends and Thai public holidays, which lowers the risk of a miscount.',
      ],
      [
        'The deadlines you use most',
        'For example the statement of defence, the witness list before the witness hearing, and an appeal after judgment.',
      ],
    ],
    note: 'General information, not legal advice. A lawyer must review every date Samnuan suggests.',
    faq: [
      [
        'Does Samnuan set the dates by itself?',
        'No. It suggests a date, and a lawyer reviews and confirms it every time.',
      ],
      [
        'What if the due date falls on a holiday?',
        'Samnuan counts past weekends and Thai public holidays, then shows the suggested date for a lawyer to check.',
      ],
    ],
    cta: 'Let Samnuan help count your case deadlines',
  },
  portal: {
    crumb: 'Client portal',
    h1: 'Let clients check|case progress themselves',
    lead: 'Clients see case status, hearing dates and documents in the portal, so your team stops answering the same calls every day.',
    plan: 'The client portal is on every plan · Clients using the portal do not count as users',
    quote: 'Clients call every week to ask where their case stands, even when nothing has changed.',
    details: [
      ['Case status clients understand', 'Case progress in date order, with the next hearing date.'],
      [
        'You choose which documents clients see',
        'Lawyers publish documents to the client one by one. Internal documents stay visible only to the office.',
      ],
      ['Case messages', 'Send case messages to the client and let them know when a new document arrives.'],
    ],
    faq: [
      ['Do I pay for client seats?', 'No. Clients who view the portal do not count as users.'],
      ['Do clients see every document?', 'No. They only see the documents your office chooses to publish.'],
    ],
    cta: 'Open the portal for your first client',
  },
  billing: {
    crumb: 'Invoices and payments',
    h1: 'Invoices that handle VAT|the way a law firm needs',
    lead: 'Invoice straight from the case file. Samnuan splits litigation and advisory VAT, records withholding tax when you are paid, and issues a receipt every time a client pays.',
    plan: `Invoicing and payments are on the ${PLAN_CONFIG[SubscriptionPlan.FIRM].name} plan and above`,
    quote: 'We invoice in Word, then open several more files just to find out how much a client still owes.',
    details: [
      [
        'Set professional fees once',
        'Price by case type: fixed fee, a percentage of the amount in dispute, tiered, or hourly. If you agree a different fee with a client, change it and Samnuan records the reason.',
      ],
      [
        'Instalments tied to case stages',
        'When a case reaches a stage you agreed to bill, Samnuan alerts the person responsible, and your office issues the invoice.',
      ],
      [
        'A receipt for every payment',
        'Accept part payments, record withholding tax, and issue a numbered receipt for each instalment.',
      ],
    ],
    calculator: true,
    faq: [
      [
        'Does Samnuan issue invoices automatically?',
        'No. It alerts you when an instalment is due, your office issues the invoice, then prints or saves it as a PDF for the client.',
      ],
      [
        "Can I use my firm's logo and tax details?",
        'Yes. Set your legal name, tax ID, branch, address and logo, then arrange the document layout by drag and drop.',
      ],
      ['Can I add a PromptPay QR code?', 'Yes. Add a PromptPay QR code and bank account details to the template.'],
    ],
    cta: 'Start invoicing from your case files',
  },
  team: {
    crumb: 'Team workload',
    h1: 'Know who has each task|without walking round to ask',
    lead: "Assign work with due dates, set permissions by role, and see the whole office's workload in one place.",
    plan: `Task assignment and role permissions start on the ${PLAN_CONFIG[SubscriptionPlan.TEAM].name} plan · Firm-wide reports start on the ${PLAN_CONFIG[SubscriptionPlan.FIRM].name} plan`,
    quote: "I walk round asking each person how their work is going, and I still can't tell who is overloaded.",
    details: [
      ['Every task has an owner', 'Assign work from the case page with a named owner and a due date.'],
      ['Permissions by role', 'Lawyers, office staff and partners each see what their role needs.'],
      [
        'Workload per person',
        "See each person's workload as a chart, and ask the AI to point out bottlenecks when you want it to.",
      ],
    ],
    faq: [
      ['Does the AI act on its own?', 'No. The AI only runs when someone presses the button.'],
      [
        'How fine-grained are permissions?',
        'They follow each role in the team, so everyone sees only what relates to their own work.',
      ],
    ],
    cta: "Start organising your team's work in Samnuan",
  },
  cases: {
    crumb: 'Case files',
    h1: 'Every case file in one place,|easy to find',
    lead: 'Case details, documents and every update live on one case page, not scattered across folders and chats.',
    plan: 'Case and document management is on every plan',
    quote: "Case documents are spread across email, LINE and everyone's own folders.",
    details: [
      ['All on one case page', 'Parties, court, amount in dispute, hearings and documents together.'],
      ['Case history', 'Every change is logged in date order, so you know who did what and when.'],
      ['Export your data', 'Export the case list as a CSV file to use in other software.'],
    ],
    faq: [
      ['Can I bring my data over from Excel?', 'Yes. You can import case data from Excel.'],
      [
        'How many cases does the free plan hold?',
        `The ${PLAN_CONFIG[SubscriptionPlan.FREE].name} plan manages up to 15 cases.`,
      ],
    ],
    cta: 'Open your first case file in Samnuan',
  },
};
