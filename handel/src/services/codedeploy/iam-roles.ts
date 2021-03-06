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
import { DeployContext, ServiceContext } from 'handel-extension-api';
import { deployPhase, handlebars } from 'handel-extension-support';
import * as util from '../../common/util';
import { CodeDeployServiceConfig } from './config-types';

export async function getStatementsForInstanceRole(ownServiceContext: ServiceContext<CodeDeployServiceConfig>, dependenciesDeployContexts: DeployContext[]): Promise<any[]> {
    const accountConfig = ownServiceContext.accountConfig;
    const ownPolicyStatementsTemplate = `${__dirname}/codedeploy-instance-role-statements.handlebars`;
    const handlebarsParams = {
        region: accountConfig.region,
        handelBucketName: deployPhase.getHandelUploadsBucketName(accountConfig)
    };
    const compiledPolicyStatements = await handlebars.compileTemplate(ownPolicyStatementsTemplate, handlebarsParams);
    const ownPolicyStatements = JSON.parse(compiledPolicyStatements);
    return deployPhase.getAllPolicyStatementsForServiceRole(ownServiceContext, ownPolicyStatements, dependenciesDeployContexts, true);
}
