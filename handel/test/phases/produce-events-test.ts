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
import {
    AccountConfig,
    DeployContext,
    ProduceEventsContext,
    ServiceContext,
    ServiceType
} from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import {
    DeployContexts,
    EnvironmentContext,
} from '../../src/datatypes';
import * as produceEvents from '../../src/phases/produce-events';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('produceEvents module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('produceEvents', () => {
        it('should execute produceEvents on all services that specify themselves as producers for other services', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                lambda: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [],
                    produceEvents: async (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) => {
                        throw new Error(`Lambda doesn't produce events`);
                    },
                    supportsTagging: true,
                },
                s3: {
                    producedEventsSupportedServices: [
                        'lambda',
                    ],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [],
                    produceEvents: async (ownServiceContext, ownDeployContext, eventConsumerConfig, consumerServiceContext, consumerDeployContext) => {
                        return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
                    },
                    supportsTagging: true,
                }
            });

            // Create EnvironmentContext
            const appName = 'test';
            const environmentName = 'dev';
            const environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);

            // Construct ServiceContext B (Consuming service)
            const serviceNameB = 'B';
            const serviceTypeB = 'lambda';
            const paramsB = {
                type: serviceTypeB,
                other: 'param'
            };
            const serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, new ServiceType(STDLIB_PREFIX, serviceTypeB), paramsB, accountConfig);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            // Construct ServiceContext A (Producing service)
            const serviceNameA = 'A';
            const serviceTypeA = 's3';
            const paramsA = {
                type: serviceTypeA,
                some: 'param',
                event_consumers: [{
                    service_name: 'B'
                }]
            };
            const serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, new ServiceType(STDLIB_PREFIX, serviceTypeA), paramsA, accountConfig);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;

            // Create deployContexts
            const deployContexts: DeployContexts = {};
            deployContexts[serviceNameA] = new DeployContext(serviceContextA);
            deployContexts[serviceNameB] = new DeployContext(serviceContextB);

            const retProduceEventsContext = await produceEvents.produceEvents(serviceRegistry, environmentContext, deployContexts);
            expect(retProduceEventsContext['A->B']).to.be.instanceof(ProduceEventsContext);
        });
    });
});
