declare module "main" {
    export function get_metadata(): I64;
    export function handle_message();
    export function hank();
    export function install();
    export function initialize();
}

declare module "extism:host" {
    interface user {
        send_message(input: I64): I64;
        react(input: I64): I64;
        db_query(input: I64): I64;
        cron(input: I64): I64;
    }
}

declare namespace NodeJS {
    export interface Global {
        hank: any;
    }
}

declare var hank: any;
