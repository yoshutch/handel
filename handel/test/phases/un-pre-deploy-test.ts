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
import { AccountConfig, ServiceContext, ServiceType, UnPreDeployContext } from 'handel-extension-api';
import 'mocha';
import config from '../../src/account-config/account-config';
import { EnvironmentContext } from '../../src/datatypes';
import * as unPreDeployPhase from '../../src/phases/un-pre-deploy';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('preDeploy', () => {
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    describe('preDeployServices', () => {
        let environmentContext: EnvironmentContext;
        let serviceNameA: string;
        let serviceNameB: string;

        beforeEach(() => {
            // Create EnvironmentContext
            const appName = 'test';
            const environmentName = 'dev';
            environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);

            // Construct ServiceContext B
            serviceNameB = 'B';
            const serviceTypeB = 'efs';
            const paramsB = {
                type: serviceTypeB,
                other: 'param'
            };
            const serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, new ServiceType(STDLIB_PREFIX, serviceTypeB), paramsB, accountConfig);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            // Construct ServiceContext A
            serviceNameA = 'A';
            const serviceTypeA = 'ecs';
            const paramsA = {
                type: serviceTypeA,
                some: 'param',
                dependencies: [serviceNameB]
            };
            const serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, new ServiceType(STDLIB_PREFIX, serviceTypeA), paramsA, accountConfig);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;
        });

        it('should execute unpredeploy on all services, even across levels', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                    ],
                    consumedDeployOutputTypes: [],
                    unPreDeploy: (serviceContext) => {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    },
                    supportsTagging: true,
                },
                ecs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                        'policies'
                    ],
                    unPreDeploy: (serviceContext) => {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    },
                    supportsTagging: true,
                }
            });

            const unPreDeployContexts = await unPreDeployPhase.unPreDeployServices(serviceRegistry, environmentContext);
            expect(unPreDeployContexts[serviceNameA]).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployContexts[serviceNameB]).to.be.instanceof(UnPreDeployContext);
        });

        it('should return empty unpredeploy contexts for deployers that dont implement unpredeploy', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                    ],
                    consumedDeployOutputTypes: [],
                    unPreDeploy: (serviceContext) => {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    },
                    supportsTagging: true,
                },
                ecs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                        'policies'
                    ],
                    supportsTagging: true,
                    // Simulating that ECS doesn't implement unpredeploy
                }
            });

            const unPreDeployContexts = await unPreDeployPhase.unPreDeployServices(serviceRegistry, environmentContext);
            expect(unPreDeployContexts[serviceNameA]).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployContexts[serviceNameB]).to.be.instanceof(UnPreDeployContext);
        });
    });
});
