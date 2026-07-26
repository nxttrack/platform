import "server-only";

import net from "node:net";
import tls from "node:tls";
import type { TransactionalEmailInput } from "./transactional";
import type { SmtpEmailConfig } from "./platform-settings";

export async function sendSmtpEmail(config: SmtpEmailConfig, input: TransactionalEmailInput) {
  const socket = await connect(config);
  const session = new SmtpSession(socket);

  try {
    await expectResponse(session.readResponse(), 220, "SMTP greeting");
    const ehlo = await sendCommand(session, `EHLO ${smtpHostname()}`, 250, "EHLO");

    if (!config.secure) {
      if (!ehlo.lines.some((line) => line.toUpperCase().includes("STARTTLS"))) {
        throw new Error("SMTP server does not advertise STARTTLS.");
      }

      await sendCommand(session, "STARTTLS", 220, "STARTTLS");
      await session.upgradeToTls(config.host);
      await sendCommand(session, `EHLO ${smtpHostname()}`, 250, "EHLO after STARTTLS");
    }

    await sendCommand(session, "AUTH LOGIN", 334, "AUTH LOGIN");
    await sendCommand(session, Buffer.from(config.user).toString("base64"), 334, "SMTP username");
    await sendCommand(session, Buffer.from(config.password).toString("base64"), 235, "SMTP password");
    await sendCommand(session, `MAIL FROM:<${config.fromEmail}>`, 250, "MAIL FROM");
    await sendCommand(session, `RCPT TO:<${input.to}>`, [250, 251], "RCPT TO");
    await sendCommand(session, "DATA", 354, "DATA");
    await sendCommand(session, `${buildMessage(config, input)}\r\n.`, 250, "message body");
    await sendCommand(session, "QUIT", 221, "QUIT");
  } finally {
    session.end();
  }
}

async function connect(config: SmtpEmailConfig) {
  if (config.secure) {
    const socket = tls.connect({ host: config.host, port: config.port, servername: config.host });
    configureTimeout(socket);
    await once(socket, "secureConnect");
    return socket;
  }

  const socket = net.connect({ host: config.host, port: config.port });
  configureTimeout(socket);
  await once(socket, "connect");
  return socket;
}

type SmtpResponse = {
  code: number;
  lines: string[];
};

class SmtpSession {
  private buffer = "";
  private pending: { reject: (error: Error) => void; resolve: (response: SmtpResponse) => void } | null = null;
  private socket: net.Socket | tls.TLSSocket;

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.attach(socket);
  }

  end() {
    this.socket.end();
  }

  write(command: string) {
    this.socket.write(`${command}\r\n`);
  }

  readResponse(): Promise<SmtpResponse> {
    const response = this.takeResponse();

    if (response) {
      return Promise.resolve(response);
    }

    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  async upgradeToTls(host: string) {
    const previousSocket = this.socket;

    previousSocket.setTimeout(0);
    previousSocket.removeAllListeners("data");
    previousSocket.removeAllListeners("error");
    previousSocket.removeAllListeners("close");

    const secureSocket = tls.connect({ socket: previousSocket, servername: host });
    configureTimeout(secureSocket);
    await once(secureSocket, "secureConnect");
    this.socket = secureSocket;
    this.attach(secureSocket);
  }

  private attach(socket: net.Socket | tls.TLSSocket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      const response = this.takeResponse();

      if (response && this.pending) {
        this.pending.resolve(response);
        this.pending = null;
      }
    });
    socket.on("error", (error) => this.rejectPending(error));
    socket.on("close", () => this.rejectPending(new Error("SMTP connection closed.")));
  }

  private rejectPending(error: Error) {
    if (!this.pending) {
      return;
    }

    this.pending.reject(error);
    this.pending = null;
  }

  private takeResponse(): SmtpResponse | null {
    const normalized = this.buffer.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");

    if (!normalized.endsWith("\n")) {
      lines.pop();
    }

    for (let index = 0; index < lines.length; index += 1) {
      const match = /^(\d{3})\s/.exec(lines[index] ?? "");

      if (!match) {
        continue;
      }

      const consumed = lines.slice(0, index + 1);
      const remaining = lines.slice(index + 1);
      this.buffer = remaining.length > 0 ? `${remaining.join("\n")}\n`.replace(/\n/g, "\r\n") : "";

      return {
        code: Number.parseInt(match[1] ?? "0", 10),
        lines: consumed
      };
    }

    return null;
  }
}

async function sendCommand(session: SmtpSession, command: string, expectedCodes: number | number[], label: string) {
  session.write(command);

  return expectResponse(session.readResponse(), expectedCodes, label);
}

async function expectResponse(responsePromise: Promise<SmtpResponse>, expectedCodes: number | number[], label: string) {
  const response = await responsePromise;
  const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];

  if (!codes.includes(response.code)) {
    throw new Error(`${label} failed with SMTP ${response.code}: ${response.lines.join(" | ")}`);
  }

  return response;
}

function buildMessage(config: SmtpEmailConfig, input: TransactionalEmailInput) {
  const body = input.html ?? input.text;
  const contentType = input.html ? "text/html" : "text/plain";
  const headers = [
    `From: ${formatAddress(config.fromEmail, config.fromName)}`,
    `To: ${sanitizeHeader(input.to)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: ${contentType}; charset=UTF-8`,
    "Content-Transfer-Encoding: 8bit"
  ];

  return `${headers.join("\r\n")}\r\n\r\n${dotStuff(body)}`;
}

function dotStuff(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function encodeHeader(value: string) {
  const sanitized = sanitizeHeader(value);

  return /^[\x00-\x7F]*$/.test(sanitized) ? sanitized : `=?UTF-8?B?${Buffer.from(sanitized).toString("base64")}?=`;
}

function formatAddress(email: string, name: string) {
  const safeEmail = sanitizeHeader(email);
  const safeName = sanitizeHeader(name);

  return safeName ? `"${safeName.replace(/"/g, "'")}" <${safeEmail}>` : safeEmail;
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function smtpHostname() {
  return process.env.SMTP_EHLO_HOSTNAME || "nxttrack.nl";
}

function configureTimeout(socket: net.Socket | tls.TLSSocket) {
  const parsed = Number.parseInt(process.env.EMAIL_DELIVERY_TIMEOUT_MS ?? "15000", 10);
  const timeoutMs = Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 60_000 ? parsed : 15_000;

  socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`SMTP operation timed out after ${timeoutMs}ms.`)));
}

function once(socket: net.Socket | tls.TLSSocket, event: "connect" | "secureConnect") {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      socket.off(event, onEvent);
      socket.off("error", onError);
    };

    socket.once(event, onEvent);
    socket.once("error", onError);
  });
}
