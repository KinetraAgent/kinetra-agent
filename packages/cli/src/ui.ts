const color = !!process.stdout.isTTY && !process.env.NO_COLOR;

const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (s: string) => (color ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m` : s);
};

export const c = {
  cyan: rgb("#22e1f5"),
  blue: rgb("#3d7bff"),
  violet: rgb("#6b5bff"),
  green: rgb("#3df5a8"),
  red: rgb("#ff5c7a"),
  yellow: rgb("#ffc857"),
  dim: (s: string) => (color ? `\x1b[2m${s}\x1b[22m` : s),
  bold: (s: string) => (color ? `\x1b[1m${s}\x1b[22m` : s),
};

/** Logo colors, cyan → blue → violet, across the text. */
export function gradient(text: string): string {
  if (!color) return text;
  const stops = [
    [34, 225, 245],
    [61, 123, 255],
    [107, 91, 255],
  ];
  return [...text]
    .map((ch, i, all) => {
      const t = (i / Math.max(all.length - 1, 1)) * (stops.length - 1);
      const [a, b] = [stops[Math.floor(t)], stops[Math.min(Math.ceil(t), stops.length - 1)]];
      const mix = a.map((v, k) => Math.round(v + (b[k] - v) * (t - Math.floor(t))));
      return `\x1b[38;2;${mix.join(";")}m${ch}`;
    })
    .join("")
    .concat("\x1b[39m");
}

export function banner(version: string, provider: string, model: string, mode: string) {
  return [
    "",
    `  ${gradient("◢◤ K I N E T R A")}  ${c.dim("v" + version)}`,
    `  ${c.dim("from intent to execution")}`,
    `  ${c.cyan("●")} ${provider}/${model}  ${c.dim("·")}  mode ${c.bold(mode)}  ${c.dim("·  /help")}`,
    "",
  ].join("\n");
}

export const colorDiff = (preview: string) =>
  preview
    .split("\n")
    .map((l) => (l.startsWith("+ ") ? c.green(l) : l.startsWith("- ") ? c.red(l) : l.startsWith("@@") ? c.dim(l) : l))
    .join("\n");

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer?: NodeJS.Timeout;
  start(label = "executing") {
    if (!process.stderr.isTTY || this.timer) return;
    let i = 0;
    this.timer = setInterval(() => process.stderr.write(`\r${c.cyan(FRAMES[i++ % FRAMES.length])} ${c.dim(label)}`), 80);
  }
  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    process.stderr.write("\r\x1b[2K");
  }
}
