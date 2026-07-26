import type { ReactGenerationErrorCode } from "@uig/generator-react";

export interface PinnedRunIdentity {
  dev: string;
  ino: string;
}

export type GenerateWorkerInbound =
  | {
      type: "initialize";
      runId: string;
      expectedIdentity: PinnedRunIdentity;
      explicitPackPath?: string;
    }
  | {
      type: "publish";
    };

export type GenerateWorkerOutbound =
  | {
      type: "ready-to-publish";
    }
  | {
      type: "result";
      status: "generated" | "blocked";
      writeStatus: "written" | "identical";
    }
  | {
      type: "error";
      code: ReactGenerationErrorCode;
      message: string;
    };
