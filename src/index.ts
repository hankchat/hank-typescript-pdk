import {
  CronInput, CronJob, DbQueryInput, DbQueryOutput, HankClientImpl, Message,
  Metadata, PreparedStatement, ReactInput, Reaction, Results, Rpc,
  SendMessageInput
} from "@hank.chat/types";

class HankRpc implements Rpc {
  [index: string]: any;

  protected send_message;
  protected react;
  protected db_query;
  protected cron;

  public constructor() {
    const { send_message, react, db_query, cron } = Host.getFunctions();

    this.send_message = send_message;
    this.react = react;
    this.db_query = db_query;
    this.cron = cron;
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
  protected metadata: Metadata;
  protected messageHandler: Function | undefined;
  protected installFn: Function | undefined;
  protected initializeFn: Function | undefined;

  public constructor() {
    this.client = new HankClientImpl(new HankRpc());
    this.metadata = Metadata.create();
  }

  public sendMessage(message: Message) {
    this.client.send_message(SendMessageInput.create({ message: message }));
  }

  public react(reaction: Reaction) {
    this.client.react(ReactInput.create({ reaction: reaction }));
  }

  public async dbQuery(preparedStatement: PreparedStatement): Promise<Results> {
    let response: DbQueryOutput = await this.client.db_query(
      DbQueryInput.create({ preparedStatement: preparedStatement })
    );
    return (response.results as Results);
  }

  public cron(cronjob: CronJob) {
    this.client.cron(CronInput.create({ cronJob: cronjob }));
  }

  get pluginMetadata(): Metadata {
    return this.metadata;
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
}

export const hank = globalThis.hank = new Hank();

export interface HandleMessageInput {
  message: Message,
}
export function handle_message() {
  const message = Message.decode(new Uint8Array(Host.inputBytes()));
  const input: HandleMessageInput = { message: message };

  hank.handleMessage(input);
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
