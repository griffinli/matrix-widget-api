/*
 * Copyright 2023 Nordeck IT + Consulting GmbH.
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

import { runTemplate } from "../src";

describe("runTemplate", () => {
    it("should replace device id template in url", () => {
        const url = "https://localhost/?my-query#device_id=$org.matrix.msc3819.matrix_device_id";
        const replacedUrl = runTemplate(
            url,
            {
                id: "widget-id",
                creatorUserId: '@user-id',
                type: 'type',
                url,
            },
            {
                deviceId: "my-device-id",
                currentUserId: '@user-id',
            },
        );

        expect(replacedUrl).toBe("https://localhost/?my-query#device_id=my-device-id");
    });
});
