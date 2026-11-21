// QR を読む部品（カメラ・写真。M4 の「QR を読む」と M7 の「参加者の QR を読む」。FR-M24・AD-30。match-005）。
// - カメラ（背面）を開き、映像から QR を探す（qr-decode.ts：BarcodeDetector、なければ jsQR）。読めたら onRead に渡す
// - カメラを使えない（許可しない・カメラがない・ブラウザが使わせない）ときは、その旨を出し、写真から読む形を勧める
// - 写真から読む：ファイルを選ぶ（スマホでは、その場で撮れる）。読めなければ撮り直しを勧める
// - 映像・写真はどこにも送らない・残さない。閉じたらカメラを止める
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useId, useRef, useState } from "react";
import { detectQr, detectQrInFile } from "./qr-decode.ts";

/** 映像から読む間（ミリ秒）。 */
const SCAN_INTERVAL_MS = 250;

/** QrScanner が受け取るもの。 */
export type QrScannerProps = {
  /** 読んだ文字を受け取る（"done" ならカメラを止める。"continue" なら次を読む〈つづきの QR・次の人〉） */
  onRead: (text: string) => "done" | "continue" | Promise<"done" | "continue">;
};

/**
 * QR を読む部品。
 * @param props 読んだ文字を受け取る関数（onRead）
 * @returns 要素
 */
export function QrScanner({ onRead }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const [camera, setCamera] = useState<"starting" | "on" | "off" | "done">("starting");
  const [cameraError, setCameraError] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const fileId = useId();

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = "";
    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
    const scan = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      try {
        const text = await detectQr(video, video.videoWidth, video.videoHeight);
        if (text && text !== last && !stopped) {
          last = text;
          if ((await onReadRef.current(text)) === "done") {
            setCamera("done");
            stop();
            return;
          }
        }
      } catch {
        // 1枚の絵が読めなくても続ける
      }
      if (!stopped) timer = setTimeout(() => void scan(), SCAN_INTERVAL_MS);
    };
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("off");
        setCameraError("このブラウザではカメラを使えません。");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped) {
          stop();
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setCamera("on");
        void scan();
      } catch (caught) {
        setCamera("off");
        setCameraError(
          caught instanceof DOMException && caught.name === "NotAllowedError"
            ? "カメラの使用が許可されていません。ブラウザの設定でカメラを許可するか、写真から読んでください。"
            : "カメラを開けませんでした。写真から読んでください。",
        );
      }
    })();
    return stop;
  }, []);

  /**
   * 選んだ写真から読む。
   * @param file 写真
   */
  const readFile = async (file: File) => {
    setFileError(undefined);
    try {
      const text = await detectQrInFile(file);
      if (!text) {
        setFileError(
          "QR が見つかりませんでした。QR が大きく、まっすぐ写るように撮り直してください。",
        );
        return;
      }
      await onReadRef.current(text);
    } catch {
      setFileError("写真を読めませんでした。別の写真を選んでください。");
    }
  };

  return (
    <div className="flex flex-col gap-xxs">
      {camera === "off" ? (
        <ResponseMessage tone="danger">{cameraError ?? "カメラを使えません。"}</ResponseMessage>
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="カメラの映像（QR を枠の中に入れてください）"
          className={
            camera === "done" ? "hidden" : "aspect-square w-full rounded-md bg-text object-cover"
          }
        />
      )}
      {camera === "starting" ? (
        <p className="text-s text-text-sub">
          カメラを開いています…（許可を求められたら「許可」を押してください）
        </p>
      ) : null}
      <div className="flex flex-col gap-x3s">
        <label htmlFor={fileId} className="text-s font-bold">
          写真から読む
        </label>
        <input
          id={fileId}
          type="file"
          accept="image/*"
          capture="environment"
          className="text-s"
          onChange={(change) => {
            const file = change.target.files?.[0];
            change.target.value = "";
            if (file) void readFile(file);
          }}
        />
        {fileError ? <ResponseMessage tone="danger">{fileError}</ResponseMessage> : null}
      </div>
    </div>
  );
}
