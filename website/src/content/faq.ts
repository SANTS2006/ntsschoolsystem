import type { FaqItem } from "@/components/Bits";

export const FAQ: FaqItem[] = [
  {
    q: "What is the NTS School System?",
    a: "It is a web-based school management system from NTS Digital Solutions. One platform covers student records, admissions, academics, attendance, examinations and results, fees, communication, and campus services such as the library, hostel and transport.",
  },
  {
    q: "Can several schools use it at the same time?",
    a: "Yes. The platform is multi-tenant: each school has its own address, sign-in page, branding, users and data. A school's information is kept separate from every other school's.",
  },
  {
    q: "Do we need to install anything?",
    a: "No. It runs in a web browser on a computer, tablet or phone. It can also be installed to the home screen or desktop like an app.",
  },
  {
    q: "Does it work without a good internet connection?",
    a: "It needs an internet connection to load and save data. The installed app keeps its interface ready so it opens quickly, but records are read and saved online.",
  },
  {
    q: "Who can see what?",
    a: "Access is controlled by roles and permissions. A teacher sees their own classes, a student sees their own information, an accountant sees finance, and so on. The school can edit the standard roles or create its own and decide exactly what each can do.",
  },
  {
    q: "Can parents or guardians log in?",
    a: "Guardians are recorded against each student and can be invited to meetings and receive e-mails. A dedicated parent login and portal is not part of the product today, so we do not promise it.",
  },
  {
    q: "Can parents pay fees online?",
    a: "The system records fees, invoices, payments, receipts and refunds. It does not connect to an online payment gateway or mobile-money API at present, so payments are recorded by your finance staff.",
  },
  {
    q: "Does it send SMS messages?",
    a: "No. Notifications are shown in the app and sent by e-mail. SMS is not currently part of the product.",
  },
  {
    q: "Is there a mobile app in the app stores?",
    a: "There is no native app in the app stores. The web app can be installed on a phone or computer from the browser.",
  },
  {
    q: "How much does it cost?",
    a: "Pricing depends on the size and needs of your school, so we ask you to request a quote. We will give you a clear figure after we understand what you need, and we do not publish prices we cannot stand behind.",
  },
  {
    q: "How do we get started?",
    a: "Request a demo or contact us. We will talk through your school's needs and show you the parts of the system that matter to you. If you go ahead, we set up your school on the platform and you configure your academic years, classes and roles.",
  },
  {
    q: "Can you help move our existing records?",
    a: "Tell us in your enquiry what you keep today and in what form, and we will explain what is possible. We do not promise a particular migration service on this website.",
  },
  {
    q: "What happens to our data if something goes wrong?",
    a: "The platform can take encrypted database backups with verification and retention, and supports a guided restore. Ask us for the current backup arrangements for your school.",
  },
  {
    q: "How do we get support?",
    a: "Write to hello@ntsdigitalsolutions.com, call +232 31 034 604, or message us on WhatsApp. We do not publish response-time guarantees on this website.",
  },
];
