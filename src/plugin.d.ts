declare module "main" {
  export function PluginMetadata();
  export function plugin();
  export function hank();
  export function handle_get_metadata(): I32;
  export function handle_install(): I32;
  export function handle_initialize(): I32;
  export function handle_chat_message(): I32;
  export function handle_chat_command(): I32;
  export function handle_scheduled_job(): I32;
}

declare module "extism:host" {
  interface user {
    send_message(input: I64): I64;
    react(input: I64): I64;
    db_query(input: I64): I64;
    cron(input: I64): I64;
    one_shot(input: I64): I64;
    reload_plugin(input: I64): I64;
    instruct_plugin(input: I64): I64;
  }
}

declare namespace NodeJS {
  export interface Global {
    hank: any;
  }
}

declare var hank: any;
