export class RegExps {
  readonly start: RegExp;
  readonly mirrorTar: RegExp;
  readonly mirror: RegExp;
  readonly mirrorStatus: RegExp;
  readonly list: RegExp;
  readonly getFolder: RegExp;
  readonly cancelMirror: RegExp;
  readonly cancelAll: RegExp;
  readonly stats: RegExp;
  readonly getLink: RegExp;
  readonly clone: RegExp;
  readonly id: RegExp;
  readonly mf: RegExp;
  readonly tar: RegExp;
  readonly unzipMirror: RegExp;
  readonly count: RegExp;
  readonly help: RegExp;
  readonly authorize: RegExp;
  readonly unauthorize: RegExp;

  constructor(commands: string[]) {
    this.start = new RegExp(commands[0], 'i');
    this.mirrorTar = new RegExp(commands[1], 'i');
    this.mirror = new RegExp(commands[2], 'i');
    this.mirrorStatus = new RegExp(commands[3], 'i');
    this.list = new RegExp(commands[4], 'i');
    this.getFolder = new RegExp(commands[5], 'i');
    this.cancelMirror = new RegExp(commands[6], 'i');
    this.cancelAll = new RegExp(commands[7], 'i');
    this.stats = new RegExp(commands[8], 'i');
    this.getLink = new RegExp(commands[9], 'i');
    this.clone = new RegExp(commands[10], 'i');
    this.id = new RegExp(commands[11], 'i');
    this.mf = new RegExp(commands[12], 'i');
    this.tar = new RegExp(commands[13], 'i');
    this.unzipMirror = new RegExp(commands[14], 'i');
    this.count = new RegExp(commands[15], 'i');
    this.help = new RegExp(commands[16], 'i');
    this.authorize = new RegExp(commands[17], 'i');
    this.unauthorize = new RegExp(commands[18], 'i');
  }
}