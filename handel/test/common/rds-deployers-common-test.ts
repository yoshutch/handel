/*
 * Copyright 2018 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { expect } from 'chai';
import { AccountConfig, ServiceContext, ServiceType, UnDeployContext } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as rdsDeployersCommon from '../../src/common/rds-deployers-common';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('RDS deployers common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getDeployContext', () => {
        it('should return the RDS deploy context from the service context and deployed stack', () => {
            const serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'FakeType'), {type: 'FakeType'}, accountConfig);
            const dbAddress = 'FakeAddress';
            const dbPort = 55555;
            const dbUsername = 'FakeUsername';
            const dbName = 'FakeDbName';

            const rdsCfStack = {
                Outputs: [
                    {
                        OutputKey: 'DatabaseAddress',
                        OutputValue: dbAddress
                    },
                    {
                        OutputKey: 'DatabasePort',
                        OutputValue: dbPort
                    },
                    {
                        OutputKey: 'DatabaseName',
                        OutputValue: dbName
                    }
                ]
            };

            const deployContext = rdsDeployersCommon.getDeployContext(serviceContext, rdsCfStack);
            expect(deployContext.environmentVariables.FAKESERVICE_ADDRESS).to.equal(dbAddress);
            expect(deployContext.environmentVariables.FAKESERVICE_PORT).to.equal(dbPort);
            expect(deployContext.environmentVariables.FAKESERVICE_DATABASE_NAME).to.equal(dbName);
        });
    });
});
