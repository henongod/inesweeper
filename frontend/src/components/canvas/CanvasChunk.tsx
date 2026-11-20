import { LockKeyhole } from "lucide-react";
import { CHUNK_SIZE } from "@/lib/canvas/coordinates";

const CELL_SIZE = 30;
const CHUNK_PIXEL_SIZE = CHUNK_SIZE * CELL_SIZE;

type CanvasChunkProps = {
  state: "open" | "locked" | "solved";
  colorClassName: string;
  hasMineBitmap: boolean;
  onClick: () => void;
};

const CanvasChunk = ({
  state,
  colorClassName,
  hasMineBitmap,
  onClick,
}: CanvasChunkProps) => {
  const backgroundClassName = state === "solved"
    ? (hasMineBitmap ? "" : "bg-[var(--game-chunksolved)]")
    : hasMineBitmap
      ? colorClassName
      : state === "locked"
        ? "bg-game-chunklocked"
        : "";

  return (
    <div
      className={`relative grid ${backgroundClassName}`}
      onClick={onClick}
      style={{
        width: CHUNK_PIXEL_SIZE,
        height: CHUNK_PIXEL_SIZE,
      }}
    >
      {state === "locked" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <LockKeyhole size={100} />
        </div>
      )}
    </div>
  );
};

export default CanvasChunk;


