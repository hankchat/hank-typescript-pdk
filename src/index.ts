import {
  AccessCheck,
  AccessCheckChain,
  AccessCheckOperator,
  accessCheckOperatorFromJSON,
  CronInput, CronJob, DbQueryInput, DbQueryOutput, HankClientImpl, Message,
  Metadata, OneShotInput, OneShotJob, PreparedStatement, ReactInput, Reaction, Results, Rpc,
  SendMessageInput
} from "@hank.chat/types";
import { JsonObject } from "type-fest";
import "polyfill-crypto-methods";
import { v4 as uuidv4 } from "uuid";

class HankRpc implements Rpc {
  [index: string]: any;

  protected send_message;
  protected react;
  protected db_query;
  protected cron;

  public constructor() {
    const { send_message, react, db_query, cron, one_shot } = Host.getFunctions();

    this.send_message = send_message;
    this.react = react;
    this.db_query = db_query;
    this.cron = cron;
    this.one_shot = one_shot;
  }

  public request(_service: string, method: string, data: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, _reject) => {
      let mem = Memory.fromBuffer(data.buffer);
      let offset = this[method](mem.offset);
      let response = Memory.find(offset).readBytes();
      resolve(new Uint8Array(response));
    });
  }
}

class Hank {
  protected client: HankClientImpl;
  protected metadata: Metadata | undefined;
  protected messageHandler: Function | undefined;
  protected commandHandler: Function | undefined;
  protected installFn: Function | undefined;
  protected initializeFn: Function | undefined;
  protected cronjobs: Map<string, Function>;

  public constructor() {
    this.client = new HankClientImpl(new HankRpc());
    this.cronjobs = new Map<string, Function>();
  }

  public sendMessage(message: Message) {
    this.client.send_message(SendMessageInput.create({ message: message }));
  }

  public react(reaction: Reaction) {
    this.client.react(ReactInput.create({ reaction: reaction }));
  }

  public async dbQuery<T extends JsonObject>(preparedStatement: PreparedStatement): Promise<Array<T>> {
    let response: DbQueryOutput = await this.client.db_query(
      DbQueryInput.create({ preparedStatement: preparedStatement })
    );
    return (response.results as Results).rows.map(row => JSON.parse(row) as T);
  }

  public cron(cron: string, job: Function) {
    const uuid = uuidv4();
    this.cronjobs.set(uuid, job);
    const cronjob = CronJob.create({
      cron,
      job: uuid,
    });
    this.client.cron(CronInput.create({ cronJob: cronjob }));
  }

  public oneShot(duration: number, job: Function) {
    const uuid = uuidv4();
    this.cronjobs.set(uuid, job);
    const oneshot = OneShotJob.create({
      duration,
      job: uuid,
    });
    this.client.one_shot(OneShotInput.create({ oneShotJob: oneshot }));
  }

  get pluginMetadata(): Metadata {
    return this.metadata as Metadata;
  }

  set pluginMetadata(metadata: Metadata) {
    this.metadata = metadata;
  }

  public registerMessageHandler(messageHandler: Function) {
    this.messageHandler = messageHandler;
  }

  public handleMessage(input: HandleMessageInput) {
    if (this.messageHandler) {
      this.messageHandler(input);
    }
  }
  public registerCommandHandler(commandHandler: Function) {
    this.commandHandler = commandHandler;
  }

  public handleCommand(input: HandleCommandInput) {
    if (this.commandHandler) {
      this.commandHandler(input);
    }
  }

  public registerInstallFunction(fn: Function) {
    this.installFn = fn;
  }

  public handleInstall() {
    if (this.installFn) {
      this.installFn();
    }
  }

  public registerInitializeFunction(fn: Function) {
    this.initializeFn = fn;
  }

  public handleInitialize() {
    if (this.initializeFn) {
      this.initializeFn();
    }
  }

  public handleCron(uuid: string) {
    if (this.cronjobs.has(uuid)) {
      (this.cronjobs.get(uuid) as Function)();
    }
  }
}

export const hank = globalThis.hank = new Hank();

export interface HandleMessageInput {
  message: Message,
}

export interface HandleCommandInput {
  message: Message,
}

export function handle_message() {
  const message = Message.decode(new Uint8Array(Host.inputBytes()));
  const input: HandleMessageInput = { message: message };

  hank.handleMessage(input);
}

export function handle_command() {
  const message = Message.decode(new Uint8Array(Host.inputBytes()));
  const input: HandleCommandInput = { message: message };

  hank.handleCommand(input);
}

export function handle_cron() {
  hank.handleCron(Host.inputString());
}

export function get_metadata() {
  Host.outputBytes(Metadata.encode(hank.pluginMetadata).finish().buffer);
}

export function install() {
  hank.handleInstall();
}

export function initialize() {
  hank.handleInitialize();
}

type OneOfKeyValueUnion<T> = T extends { $case: infer U extends string; "value": infer V } ? { [Property in U]: V } : never;
type AccessCheckShorthand = OneOfKeyValueUnion<AccessCheck["kind"]>
type AccessCheckOperators = Exclude<keyof typeof AccessCheckOperator, "UNRECOGNIZED">;
type AccessCheckChainShorthand = Partial<Record<AccessCheckOperators, AccessCheckShorthand[]>>;
export interface PluginMetadata extends Omit<Metadata, "accessChecks"> {
  accessChecks: AccessCheckChain
  | AccessCheckChainShorthand
  | AccessCheck
  | AccessCheckShorthand[]
  | AccessCheckShorthand
  | undefined;
};

export const PluginMetadata: MessageFns<PluginMetadata, Metadata> = {
  create<I extends Exact<DeepPartial<PluginMetadata>, I>>(base?: I): Metadata {
    if (isSet(base?.accessChecks)) {
      let accessChecks = base?.accessChecks ?? AccessCheckChain.create();
      let operator = "OR";
      let checks: Array<object> = [];

      if (accessChecks instanceof Object) {
        let [key, value] = Object.entries(accessChecks)[0];

        if (value instanceof Array) {
          // We know it's the OR: [] shorthand
          [operator, checks] = [key, value];
        } else {
          if (key == "operator") {
            // We assume this is in the full { operator: "OR", checks: [ {check}, {check}, ] } format,
            // but we don't assume the checks are in the full format.
            [operator, checks] = [accessChecks.operator as unknown as string, accessChecks.checks as Array<object>];
          } else {
            [operator, checks] = ["OR", [accessChecks]];
          }
        }
      }

      if (accessChecks instanceof Array) {
        [operator, checks] = ["OR", accessChecks];
        // We know it's the [ {check}, {check}, ] shorthand
      }

      if (!checks[0]?.hasOwnProperty("kind")) {
        // Convert check shorthand into full format
        checks = checks.map(c => Object.entries(c).map(([c, v]) => { return { kind: { "$case": c, value: v } } })).map(([o]) => o);
      }

      (base as PluginMetadata).accessChecks = AccessCheckChain.create({
        operator: accessCheckOperatorFromJSON(operator),
        checks,
      });
    }

    return Metadata.create(base ?? ({} as any));
  },
};

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

type DeepPartial<T> = T extends Builtin ? T
  : T extends globalThis.Array<infer U> ? globalThis.Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
  : T extends { $case: string; value: unknown } ? { $case: T["$case"]; value?: DeepPartial<T["value"]> }
  : T extends {} ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
type Exact<P, I extends P> = P extends Builtin ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
interface MessageFns<T, M> {
  create<I extends Exact<DeepPartial<T>, I>>(base?: I): M;
}
