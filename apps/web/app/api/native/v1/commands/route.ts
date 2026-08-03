import {
  nativeJson,
  readNativeJsonBody,
  requireNativeApiContext
} from "@/lib/auth/native-api";
import {
  NATIVE_COMMAND_CONTRACT_VERSION,
  parseNativeMobileCommand
} from "@/lib/domain/native-command-contract";
import {
  executeNativeMobileCommand,
  NativeCommandRejectedError
} from "@/lib/domain/native-command-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readNativeJsonBody(request);
  const command = parseNativeMobileCommand(body);
  if (!command) {
    return nativeJson({ error: "invalid_command" }, { status: 400 });
  }
  const guard = await requireNativeApiContext(request, command.client);
  if (!guard.ok) return guard.response;

  try {
    const result = await executeNativeMobileCommand({
      accessToken: guard.accessToken,
      command,
      context: guard.context
    });
    return nativeJson({
      accepted: true,
      commandId: command.commandId,
      contractVersion: NATIVE_COMMAND_CONTRACT_VERSION,
      result,
      type: command.type
    });
  } catch (error) {
    const rejected = error instanceof NativeCommandRejectedError;
    console.error("[native-api] Command failed", {
      client: command.client,
      commandId: command.commandId,
      tenantId: guard.context.activeTenant.tenantId,
      type: command.type,
      error: rejected
        ? "database_rejected"
        : error instanceof Error
          ? error.message
          : "unexpected"
    });
    const response = nativeJson(
      { error: rejected ? "command_rejected" : "command_effects_pending" },
      { status: rejected ? 409 : 503 }
    );
    if (!rejected) response.headers.set("Retry-After", "5");
    return response;
  }
}
