// The "beforeunload" code here exists to handle the case where the user navigates away
// from the page after sending commands on the WebSocket transport, but before waiting
// for the results. There can be a situation where some of those commands are to save
// user data, but they're still buffered on the WebSocket and haven't been sent to the
// server. settings.preventDefault can be set to NEVER, WAIT_FOR_SEND, and WAIT_FOR_ACKNOWLEDGEMENT.
// NEVER disables all this logic, WAIT_FOR_SEND waits for buffered data to be sent,
// and WAIT_FOR_ACKNOWLEDGEMENT waits until all results have been received from the server.
//
// The beforeunload event is kind of hairy, best practices are to only register a handler
// when there actually is unsaved data, and then to clear it again as soon as possible.
// So this is the approach that we take, and only if the feature is enabled.
//
// We update the beforeunload handler after every sent and received message.

import {getAllClients} from "./registry";

function onUnload(ev: Event): string | undefined {
    const pending = getAllClients().some(c => c.hasPending());
    if (!pending) {
        clearUnload();
        return;
    }

    ev.preventDefault();
    // Use of returnValue and returning a string in this handler is for older browsers
    let msg = "There is unsaved data in transit that may be lost. Are you sure you want to leave?";
    // @ts-ignore
    ev.returnValue = msg;
    return msg;
}

export function updateUnloadHandler() {
    const pending = getAllClients().some(c => c.hasPending());
    if (pending) {
        setUnload();
    } else {
        clearUnload();
    }
}

let unloadRegistered: boolean = false;

function clearUnload() {
    if (!unloadRegistered) {
        return;
    }

    removeEventListener("beforeunload", onUnload, {capture: true});
    unloadRegistered = false;
}

function setUnload() {
    if (unloadRegistered) {
        return;
    }

    addEventListener("beforeunload", onUnload, {capture: true});
    unloadRegistered = true;
}