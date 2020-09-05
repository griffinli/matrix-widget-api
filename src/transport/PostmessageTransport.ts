/*
 * Copyright 2020 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ITransport } from "./ITransport";
import {
    invertedDirection,
    isErrorResponse,
    IWidgetApiErrorResponseData,
    IWidgetApiRequest,
    IWidgetApiRequestData,
    IWidgetApiResponse,
    IWidgetApiResponseData,
    WidgetApiAction,
    WidgetApiDirection,
} from "..";

interface IOutboundRequest {
    request: IWidgetApiRequest;
    resolve: (response: IWidgetApiResponseData) => void;
    reject: (err: Error) => void;
    timerId: number;
}

/**
 * Transport for the Widget API over postMessage.
 */
export class PostmessageTransport extends EventTarget implements ITransport {
    public strictOriginCheck: boolean;
    public targetOrigin: string;
    public timeoutSeconds = 10;

    private _ready = false;
    private _widgetId = null;
    private outboundRequests = new Map<string, IOutboundRequest>();

    public get ready(): boolean {
        return this._ready;
    }

    public get widgetId(): string {
        return this._widgetId || null;
    }

    public constructor(private sendDirection: WidgetApiDirection, private initialWidgetId: string) {
        super();
        this._widgetId = initialWidgetId;
    }

    private get nextRequestId(): string {
        const idBase = `widgetapi-${Date.now()}`;
        let index = 0;
        let id = idBase;
        while (this.outboundRequests.has(id)) {
            id = `${idBase}-${index++}`;
        }

        // reserve the ID
        this.outboundRequests.set(id, null);

        return id;
    }

    private sendInternal(message: IWidgetApiRequest | IWidgetApiResponse) {
        window.parent.postMessage(message, this.targetOrigin || '*');
    }

    public reply<T extends IWidgetApiResponseData>(request: IWidgetApiRequest, responseData: T) {
        return this.sendInternal(<IWidgetApiResponse>{
            ...request,
            response: responseData,
        });
    }

    public send<T extends IWidgetApiRequestData, R extends IWidgetApiResponseData>(
        action: WidgetApiAction, data: T,
    ): Promise<R> {
        if (!this.ready || !this.widgetId) {
            return Promise.reject(new Error("Not ready or unknown widget ID"));
        }
        const request: IWidgetApiRequest = {
            api: this.sendDirection,
            widgetId: this.widgetId,
            requestId: this.nextRequestId,
            action: action,
            data: data,
        };
        return new Promise<R>((prResolve, reject) => {
            const timerId = setTimeout(() => {
                const req = this.outboundRequests.get(request.requestId);
                if (!req) return; // it finished!
                this.outboundRequests.delete(request.requestId);
                req.reject(new Error("Request timed out"));
            }, (this.timeoutSeconds || 1) * 1000);
            const resolve = (d: IWidgetApiResponseData) => prResolve(<R>d);
            this.outboundRequests.set(request.requestId, {request, resolve, reject, timerId});
            this.sendInternal(request);
        });
    }

    public start() {
        window.addEventListener("message", (ev: MessageEvent) => {
            this.handleMessage(ev);
        });
    }

    private handleMessage(ev: MessageEvent) {
        if (!ev.data) return; // invalid event

        if (this.strictOriginCheck && ev.origin !== window.origin) return; // bad origin

        // treat the message as a response first, then downgrade to a request
        const response = <IWidgetApiResponse>ev.data;
        if (!response.action || !response.requestId || !response.widgetId) return; // invalid request/response

        if (!response.response) {
            // it's a request
            const request = <IWidgetApiRequest>response;
            if (request.api !== invertedDirection(this.sendDirection)) return; // wrong direction
            this.handleRequest(request);
        } else {
            // it's a response
            if (response.api !== this.sendDirection) return; // wrong direction
            this.handleResponse(response);
        }
    }

    private handleRequest(request: IWidgetApiRequest) {
        if (this.widgetId) {
            if (this.widgetId !== request.widgetId) return; // wrong widget
        } else {
            this._widgetId = request.widgetId;
        }

        this.dispatchEvent(new CustomEvent("message", {detail: request}));
    }

    private handleResponse(response: IWidgetApiResponse) {
        if (response.widgetId !== this.widgetId) return; // wrong widget

        const req = this.outboundRequests.get(response.requestId);
        if (!req) return; // response to an unknown request

        this.outboundRequests.delete(response.requestId);
        clearTimeout(req.timerId);
        if (isErrorResponse(response.response)) {
            const err = <IWidgetApiErrorResponseData>response.response;
            req.reject(new Error(err.error.message));
        } else {
            req.resolve(response.response);
        }
    }
}