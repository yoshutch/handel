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
import { isUnBindContext, ServiceRegistry } from 'handel-extension-api';
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import { DeployOrder, DontBlameHandelError, EnvironmentContext, UnBindContexts } from '../datatypes';

export async function unBindServicesInLevel(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, deployOrder: DeployOrder, level: number): Promise<UnBindContexts> {
    const unBindPromises: Array<Promise<void>> = [];
    const unBindContexts: UnBindContexts = {};

    const currentLevelServicesToUnBind = deployOrder[level];
    winston.info(`Executing UnBind phase in level ${level} in environment '${environmentContext.environmentName}' for services ${currentLevelServicesToUnBind.join(', ')}`);
    for(const toUnBindServiceName of currentLevelServicesToUnBind) {
        const toUnBindServiceContext = environmentContext.serviceContexts[toUnBindServiceName];
        const serviceDeployer = serviceRegistry.getService(toUnBindServiceContext.serviceType);

        if (serviceDeployer.unBind) {
            winston.info(`UnBinding service ${toUnBindServiceName}`);
            const unBindPromise = serviceDeployer.unBind(toUnBindServiceContext)
                .then(unBindContext => {
                    if (!isUnBindContext(unBindContext)) {
                        throw new DontBlameHandelError(`Expected UnBindContext back from 'unBind' phase of service deployer`, toUnBindServiceContext.serviceType);
                    }
                    unBindContexts[toUnBindServiceName] = unBindContext;
                });
            unBindPromises.push(unBindPromise);
        }
        else { // If unbind not implemented by deployer, return an empty unbind context
            const unBindPromise = lifecyclesCommon.unBindNotRequired(toUnBindServiceContext)
                .then(unBindContext => {
                    unBindContexts[toUnBindServiceName] = unBindContext;
                });
            unBindPromises.push(unBindPromise);
        }
    }

    await Promise.all(unBindPromises);
    return unBindContexts; // This was built up dynamically above
}
