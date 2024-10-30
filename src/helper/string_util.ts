import moment from "moment";
import { Markup } from "telegraf";

export const symbols = "✅🚫🎊⚠️💯⬅️❌❎🔙🎬⏰👋👍👌💯";

export const reduceTo = (str: string, max_len: number): string => {
  if (str.length <= max_len) return str;
  const half_len = max_len / 2 - 2;
  return str.substring(0, half_len) + "..." + str.substring(str.length - half_len);
};

// escape HTML special characters
export const escape = (str?: string) => {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

// validate username (based on the panel codebase)
export const isValidUsername = (username: string, minLength: number) => {
  return /^[a-zA-Z0-9]*$/.test(username) && username.length >= minLength;
};

// normalize string by removing newline characters and consecutive spaces
export const normalize = (value: string): string => {
  // remove newline characters to spaces
  value = value.replace(/\r\n/g, " ");
  // remove consecutive spaces
  value = value.replace(/\s+/g, " ");
  // remove leading and trailing spaces
  value = value.replace(/^\s+/, "");
  value = value.replace(/\s+$/, "");

  return value;
};

// validate password (based on the panel codebase)
export const isValidPassword = (password: string, minLength: number, username: string) => {
  if (!/^[a-zA-Z0-9]*$/.test(password)) return "Password can contain only alphanumeric characters.";
  if (password.length < minLength) return "Password is too short.";
  if (!/^.*\d.*$/.test(password)) return "Password must contain at least one numerical character.";
  if (username === password) return "Password should not be equal to username.";
  return true;
};

// check if a string is a valid email address
export const isValidEmail = (email: string) => {
  return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(
    email
  );
};

// format a date to a string
export const time2String = (d?: Date) => moment(d).utc().format("YYYY-MM-DD HH:mm");

// get telegraf markup callback buttons from double array of description and callback
export const getButtons = (data: [string, string][][]) => {
  return data.map((row) => row.map((item) => Markup.button.callback(item[0], item[1])));
};
