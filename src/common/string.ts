import { BotContext } from "../bot/context";
import { UserRole } from "./types";

export const BOT_NAME = "Automated Payment Solutions";
export const BOT_DESCRIPTION =
  "If you are looking make a purchase or renew your service please continue.\nUse /help for more information about the bot";
export const BOT_HELP_DESCRIPTION =
  "Please select from one of the following options.\nIf you're unsure what to do please contact your service provider.";

export const DOCUMENTATION_LINK = "https://support.autopay.solutions/";
export const CONTACT_LINK = "https://t.me/Amber_APS";

export const BOT_WELCOME_MESSAGE = `
<b><u>Welcome to ${BOT_NAME}</u></b>

Here you can setup your package in minutes with just a few simple steps.

<b><u>Steps</u></b>

1. Select the command you want to do i.e. renew
2. Enter the service code (your service provider will give you this)
3. Here you complete your action i.e. if it is a new purchase or renewal simply select the package you want and follow the instructions.

<b><u>Commands Explained</u></b>

/help - this will list all the commands available

/purchase - Click this if you wish to purchase a new plan

/renew - Click this if you wish to renew an existing plan (if it is your first time using this bot you will need your username and password to hand)

/add - Click this if you already have a plan and would like to add it to the bot to make it easier for you to manage in the future. You will be able to view your login and will receive reminders 7 days before your expiry is due.

/manage - Click this if you already have a plan associated to this bot. This will allow you to view any information regarding your plan.

<b><u>Need Help</u></b>

If you are unsure what to do and need further help please contact your service provider.
`;

export const OWNER_WELCOME_MESSAGE = `
<b><u>Welcome to ${BOT_NAME}</u></b>

Fed up of having to manually setup all your customers? We have created a Telegram bot that can automate all your billing for your customers! No third party software required.

<b>Features</b>
- Purchase new packages
- Renew existing packages
- Expiry reminders for your customers
- And so much more!

Click <a href="${DOCUMENTATION_LINK}">here</a>👈 to read about all the features available.

<b><u>User Requirements</u></b>

<b>- Reseller panel for XUI, XTREAM UI and XCMS</b>
<i>please note - this will not work with the admin panel it must be a reseller panel</i>

<b>- reCAPTCHA</b>
<i>This must be <u>disabled</u> for the bot to connect to the panel</i>

<b>- PayPal business account</b>
<i>If you are only using the reminders package then you don't need a PayPal business account. This is only needed for the other packages as it is integrated PayPal and requires you to have access to your Merchant ID, Client ID and Client Secret only available with a PayPal business account.</i>

<b><u>Packages</u></b>

<u>Reminders Only</u> - This package gives you and your clients automated reminders 7 days prior to their package expiry, they will be reminded every 24 hours to renew until the package expires. Your clients also have the ability to see their package details including their username and password so you don't have to remind your clients their login details.

<u>Renewals Only</u> - This package includes the reminders package as well as the ability for your customers to automatically renew their existing packages automatically.

<u>New Purchases Only</u> - This package includes the reminders package as well as the ability for your customers to automatically buy new packages. You customers don't have the ability to renew with this package.

<u>Renewals and New Purchases</u> - This package includes everything mentioned above. Reminders, Renewals and New purchases you get the full automated experience.

<b><u>Don't know how to start?</u></b>
Click <a href="${DOCUMENTATION_LINK}">here</a>👈 to read the documentation.

<b>If you have any issues or questions about this bot</b>
Click <a href="${CONTACT_LINK}">here</a>👈 to contact us

Want to make a feature request or want to see it link with your system then please make a request by clicking <a href="${CONTACT_LINK}">here</a>👈
`;

export const CURRENCY_SYMBOLS = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export const BOT_COMMANDS = [
  {
    command: "help",
    description: "Show help message",
    role: undefined,
    displayRole: UserRole.Customer,
  },
  // customer commands
  {
    command: "trial",
    description: "Purchase a new trial plan",
    role: undefined,
    displayRole: UserRole.Customer,
  },
  {
    command: "purchase",
    description: "Purchase a new plan",
    role: undefined,
    displayRole: UserRole.Customer,
  },
  {
    command: "renew",
    description: "Renew an existing plan",
    role: undefined,
    displayRole: UserRole.Customer,
  },
  {
    command: "add",
    description: "Add and manage existing plan",
    role: undefined,
    displayRole: UserRole.Customer,
  },
  {
    command: "manage",
    description: "View and manage your plans",
    role: undefined,
    displayRole: UserRole.Customer,
  },
  // service owner
  {
    command: "register",
    description: "Register as a service owner",
    role: undefined,
    displayRole: UserRole.Owner,
  },
  {
    command: "addserver",
    description: "Add a new server",
    role: UserRole.Owner,
    displayRole: UserRole.Owner,
  },
  {
    command: "dashboard",
    description: "View & manage your service",
    role: undefined,
    displayRole: UserRole.Owner,
  },
  // administration
  {
    command: "admin",
    description: "Login as admin role",
    role: UserRole.Customer,
    displayRole: UserRole.Admin,
  },
  {
    command: "botconfig",
    description: "Change bot settings",
    role: UserRole.Admin,
    displayRole: UserRole.Admin,
  },
  {
    command: "owners",
    description: "Manage owners",
    role: UserRole.Admin,
    displayRole: UserRole.Admin,
  },
];

export const getHelpContent = (ctx: BotContext) => {
  let content = "";

  const role = ctx.session.user.role;

  content += `<b>${BOT_NAME}</b>\n\n`;
  content += `${BOT_HELP_DESCRIPTION}\n\n`;

  BOT_COMMANDS.filter((cmd) => cmd.displayRole === UserRole.Customer).forEach((cmd) => {
    content += `/${cmd.command} - ${cmd.description}\n`;
  });

  if (role != UserRole.Customer) {
    let roleLabel = "Service Owner";
    if (role == UserRole.Admin) {
      roleLabel = "Administrator";
    }
    content += `\n${roleLabel} commands(private)\n`;
    BOT_COMMANDS.filter((cmd) => cmd.displayRole === role).forEach((cmd) => {
      content += `/${cmd.command} - ${cmd.description}\n`;
    });
  }

  return content;
};
