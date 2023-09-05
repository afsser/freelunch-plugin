import { decodeBase64UTF16 } from "./util";

declare global {
  interface Window {
    [key: string]: any;
  }
}

let fallbackMode: boolean = false;

export function isFallbackModeActive(): boolean {
  return fallbackMode;
}

export async function invokeNomoFunction(
  functionName: string,
  args: object | null
): Promise<any> {
  const callDate = new Date();
  const invocationID =
    functionName + "_" + callDate.toISOString() + "_" + Math.random();
  const payload: string = JSON.stringify({
    functionName,
    invocationID,
    args,
  });

  // first create a Promise
  const promise = new Promise(function (
    resolve: (value: unknown) => void,
    reject: (reason?: any) => void
  ) {
    pendingPromisesResolve[invocationID] = resolve;
    pendingPromisesReject[invocationID] = reject;
  });

  try {
    if (window.webkit) {
      // macOS
      window.webkit.messageHandlers.NOMOJSChannel.postMessage(payload);
    } else if (window.NOMOJSChannel) {
      // mobile
      window.NOMOJSChannel.postMessage(payload);
    } else if (window.chrome?.webview) {
      //windows
      window.chrome.webview.postMessage(payload);
    } else {
      fallbackMode = true;
      return Promise.reject(
        `the function ${functionName} does not work outside of the NOMO-app. The fallback-mode will be activated from now on.`
      );
    }
  } catch (e) {
    // @ts-ignore
    return Promise.reject(e.message);
  }
  return promise;
}

const pendingPromisesResolve: Record<
  string,
  null | ((value: unknown) => void)
> = {};
const pendingPromisesReject: Record<string, null | ((reason?: any) => void)> =
  {};

const fulfillPromiseFromFlutter = function (base64FromFlutter: string) {
  const jsonFromFlutter = decodeBase64UTF16(base64FromFlutter);
  const obj = JSON.parse(jsonFromFlutter);

  const invocationID: string = obj.invocationID;
  const status: "resolve" | "reject" = obj.status;
  const result = obj.result;
  if (!invocationID) {
    return "missing invocationID!";
  }
  if (!status) {
    return "missing status!";
  }
  let fulfillFunction: null | ((value: any) => void);
  if (status === "resolve") {
    fulfillFunction = pendingPromisesResolve[invocationID];
  } else {
    fulfillFunction = pendingPromisesReject[invocationID];
  }
  // clean up promises to avoid potential duplicate invocations
  pendingPromisesResolve[invocationID] = null;
  pendingPromisesReject[invocationID] = null;

  if (!fulfillFunction) {
    return "unexpected invocationID";
  }
  fulfillFunction(result); // fulfill or reject the promise
  return "OK";
};
try {
  window.fulfillPromiseFromFlutter = fulfillPromiseFromFlutter;
} catch (e) {}