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
import {
    BindContext,
    DeployContext,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import {
    awsCalls,
    bindPhase,
    deletePhases,
    deployPhase,
    handlebars,
    preDeployPhase,
    tagging
} from 'handel-extension-support';
import * as winston from 'winston';
import * as elasticacheDeployersCommon from '../../common/elasticache-deployers-common';
import {HandlebarsMemcachedTemplate, MemcachedServiceConfig} from './config-types';

const SERVICE_NAME = 'Memcached';
const MEMCACHED_PORT = 11211;
const MEMCACHED_SG_PROTOCOL = 'tcp';

function getDeployContext(serviceContext: ServiceContext<MemcachedServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);

    // Set port and address environment variables
    const port = awsCalls.cloudFormation.getOutput('CachePort', cfStack);
    const address = awsCalls.cloudFormation.getOutput('CacheAddress', cfStack);
    if(!port || !address) {
        throw new Error('Expected to receive port and address back from Memcached service');
    }

    deployContext.addEnvironmentVariables({
        PORT: port,
        ADDRESS: address
    });

    return deployContext;
}

function getCompiledMemcachedTemplate(stackName: string, ownServiceContext: ServiceContext<MemcachedServiceConfig>, ownPreDeployContext: PreDeployContext): Promise<string> {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const clusterName = elasticacheDeployersCommon.getClusterName(ownServiceContext);

    const handlebarsParams: HandlebarsMemcachedTemplate = {
        description: serviceParams.description || 'Parameter group for ' + clusterName,
        instanceType: serviceParams.instance_type,
        cacheSubnetGroup: accountConfig.elasticache_subnet_group,
        memcachedVersion: serviceParams.memcached_version,
        stackName,
        clusterName,
        memcachedSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        nodeCount: serviceParams.node_count || 1,
        memcachedPort: MEMCACHED_PORT,
        tags: tagging.getTags(ownServiceContext)
    };

    // Either create custom parameter group if params are specified, or just use default
    if (serviceParams.cache_parameters) {
        handlebarsParams.cacheParameters = serviceParams.cache_parameters;
        handlebarsParams.cacheParameterGroupFamily = 'memcached1.4';
    }
    else {
        handlebarsParams.defaultCacheParameterGroup = 'default.memcached1.4';
    }

    return handlebars.compileTemplate(`${__dirname}/memcached-template.yml`, handlebarsParams);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<MemcachedServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];
    const serviceParams = serviceContext.params;

    if (!serviceParams.instance_type) {
        errors.push(`${SERVICE_NAME} - The 'instance_type' parameter is required`);
    }
    if (!serviceParams.memcached_version) {
        errors.push(`${SERVICE_NAME} - The 'memcached_version' parameter is required`);
    }

    return errors;
}

export async function preDeploy(serviceContext: ServiceContext<MemcachedServiceConfig>): Promise<PreDeployContext> {
    return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
}

export async function bind(ownServiceContext: ServiceContext<MemcachedServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
    return bindPhase.bindDependentSecurityGroup(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, MEMCACHED_SG_PROTOCOL, MEMCACHED_PORT, SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<MemcachedServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying cluster '${stackName}'`);

    const compiledTemplate = await getCompiledMemcachedTemplate(stackName, ownServiceContext, ownPreDeployContext);
    const stackTags = tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying cluster '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function unPreDeploy(ownServiceContext: ServiceContext<MemcachedServiceConfig>): Promise<UnPreDeployContext> {
    return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export async function unBind(ownServiceContext: ServiceContext<MemcachedServiceConfig>): Promise<UnBindContext> {
    return deletePhases.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<MemcachedServiceConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'securityGroups'
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
