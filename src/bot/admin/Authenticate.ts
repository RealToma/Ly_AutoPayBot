import bcrypt from "bcrypt";
import { MASTER_PASSWORD } from "../../config/env";

import { BotContext } from "../context";
import { SessionState, UserRole } from "../../common/types";

export const showMsg4AuthAdmin = async (ctx: BotContext) => {
  ctx.session.status = SessionState.AuthenticateAdmin;
  await ctx.reply("Please enter master password.");
};

export const authAdmin = async (ctx: BotContext, pwd: string) => {
  if (await bcrypt.compare(pwd, MASTER_PASSWORD)) {
    const user = ctx.session.user;

    user.role = UserRole.Admin;
    await user.save();

    ctx.session.status = SessionState.None;
    await ctx.reply("Got admin role");
  } else {
    await ctx.reply("Invalid password. Please try again");
  }
};
