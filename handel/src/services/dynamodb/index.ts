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
    AccountConfig,
    DeployContext,
    PreDeployContext,
    ProduceEventsContext,
    ServiceConfig,
    ServiceContext,
    ServiceEventConsumer
} from 'handel-extension-api';
import { awsCalls, deletePhases, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as autoscaling from './autoscaling';
import {DynamoDBConfig, DynamoDBServiceEventConsumer} from './config-types';

const KEY_TYPE_TO_ATTRIBUTE_TYPE: any = {
    String: 'S',
    Number: 'N'
};

const SERVICE_NAME = 'DynamoDB';

function getTablePolicyForDependentServices(tableName: string, accountConfig: AccountConfig) {
    const tableArn = buildTableARN(tableName, accountConfig);
    return {
        'Effect': 'Allow',
        'Action': [
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:DeleteItem',
            'dynamodb:DescribeLimits',
            'dynamodb:DescribeReservedCapacity',
            'dynamodb:DescribeReservedCapacityOfferings',
            'dynamodb:DescribeStream',
            'dynamodb:DescribeTable',
            'dynamodb:GetItem',
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:ListStreams',
            'dynamodb:PutItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:UpdateItem'
        ],
        'Resource': [
            tableArn, // Grants access to the table itself
            `${tableArn}/index/*` // Grants access to any indexes the table may have
        ]
    };
}

function buildTableARN(tableName: string, accountConfig: AccountConfig) {
    return `arn:aws:dynamodb:${accountConfig.region}:${accountConfig.account_id}:table/${tableName}`;
}

function getLambdaConsumers(serviceContext: ServiceContext<DynamoDBConfig>) {
    const consumers = serviceContext.params.event_consumers as DynamoDBServiceEventConsumer[];
    const lambdaConsumers: any[] = [];
    consumers.forEach((consumer) => {
        lambdaConsumers.push({
            serviceName: consumer.service_name,
            batchSize: consumer.batch_size
        });
    });
    return lambdaConsumers;
}

function getDeployContext(serviceContext: ServiceContext<DynamoDBConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);
    const tableName = awsCalls.cloudFormation.getOutput('TableName', cfStack);
    if(!tableName) {
        throw new Error('Expected to receive tableName back from DynamoDB service');
    }

    // Inject policies to talk to the table
    deployContext.policies.push(getTablePolicyForDependentServices(tableName!, serviceContext.accountConfig));

    // Get values for createEventSourceMapping
    if (serviceContext.params.event_consumers) {
        deployContext.eventOutputs.tableName = tableName;
        deployContext.eventOutputs.tableStreamArn = awsCalls.cloudFormation.getOutput('StreamArn', cfStack);
        deployContext.eventOutputs.lambdaConsumers = getLambdaConsumers(serviceContext);
    }

    // Inject env vars
    deployContext.addEnvironmentVariables({
        TABLE_NAME: tableName
    });

    return deployContext;
}

function addDefinedAttribute(definedAttrs: any[], attrName: string, attrType: string) {
    function definedAttrExists(definedAttrsList: any[], attrNameToCheck: string) {
        for (const definedAttr of definedAttrsList) {
            if (definedAttr.attributeName === attrNameToCheck) {
                return true;
            }
        }
        return false;
    }

    if (!definedAttrExists(definedAttrs, attrName)) {
        definedAttrs.push({
            attributeName: attrName,
            attributeType: attrType
        });
    }
}

function getDefinedAttributes(ownServiceContext: ServiceContext<DynamoDBConfig>) {
    const serviceParams = ownServiceContext.params;

    const definedAttributes: any[] = [];

    // Add partition and sort keys from main table
    addDefinedAttribute(definedAttributes, serviceParams.partition_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[serviceParams.partition_key.type]);
    if (serviceParams.sort_key) {
        addDefinedAttribute(definedAttributes, serviceParams.sort_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[serviceParams.sort_key.type]);
    }

    // Add attributes from global indexes
    if (serviceParams.global_indexes) {
        for (const globalIndexConfig of serviceParams.global_indexes) {
            addDefinedAttribute(definedAttributes, globalIndexConfig.partition_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[globalIndexConfig.partition_key.type]);
            if (globalIndexConfig.sort_key) {
                addDefinedAttribute(definedAttributes, globalIndexConfig.sort_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[globalIndexConfig.sort_key.type]);
            }
        }
    }

    // Add attributes from local indexes
    if (serviceParams.local_indexes) {
        for (const localIndexConfig of serviceParams.local_indexes) {
            addDefinedAttribute(definedAttributes, localIndexConfig.sort_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[localIndexConfig.sort_key.type]);
        }
    }

    return definedAttributes;
}

function getGlobalIndexConfig(ownServiceContext: ServiceContext<DynamoDBConfig>, tableThroughputConfig: autoscaling.ThroughputConfig) {
    const serviceParams = ownServiceContext.params;

    const handlebarsGlobalIndexes = [];

    if (serviceParams.global_indexes) {
        for (const globalIndexConfig of serviceParams.global_indexes) {
            const throughput = autoscaling.getThroughputConfig(globalIndexConfig.provisioned_throughput, tableThroughputConfig);

            const handlebarsGlobalIndex: any = {
                indexName: globalIndexConfig.name,
                indexReadCapacityUnits: throughput.read.initial,
                indexWriteCapacityUnits: throughput.write.initial,
                indexPartitionKeyName: globalIndexConfig.partition_key.name,
                indexProjectionAttributes: globalIndexConfig.attributes_to_copy
            };

            // Add sort key if provided
            if (globalIndexConfig.sort_key) {
                handlebarsGlobalIndex.indexSortKeyName = globalIndexConfig.sort_key.name;
            }

            handlebarsGlobalIndexes.push(handlebarsGlobalIndex);
        }
    }

    return handlebarsGlobalIndexes;
}

function getLocalIndexConfig(ownServiceContext: ServiceContext<DynamoDBConfig>) {
    const serviceParams = ownServiceContext.params;

    const handlebarsLocalIndexes = [];

    if (serviceParams.local_indexes) {
        for (const localIndexConfig of serviceParams.local_indexes) {
            const handlebarsGlobalIndex = {
                indexName: localIndexConfig.name,
                indexPartitionKeyName: serviceParams.partition_key.name,
                indexSortKeyName: localIndexConfig.sort_key.name,
                indexProjectionAttributes: localIndexConfig.attributes_to_copy
            };

            handlebarsLocalIndexes.push(handlebarsGlobalIndex);
        }
    }

    return handlebarsLocalIndexes;
}

async function getCompiledDynamoTemplate(stackName: string, ownServiceContext: ServiceContext<DynamoDBConfig>): Promise<string> {
    const serviceParams = ownServiceContext.params;

    const throughputConfig = autoscaling.getThroughputConfig(serviceParams.provisioned_throughput, null);

    const handlebarsParams: any = {
        tableName: serviceParams.table_name || stackName,
        attributeDefinitions: getDefinedAttributes(ownServiceContext),
        tablePartitionKeyName: serviceParams.partition_key.name,
        tableReadCapacityUnits: throughputConfig.read.initial,
        tableWriteCapacityUnits: throughputConfig.write.initial,
        ttlAttribute: serviceParams.ttl_attribute,
        tags: tagging.getTags(ownServiceContext)
    };

    // Add sort key if provided
    if (serviceParams.sort_key) {
        handlebarsParams.tableSortKeyName = serviceParams.sort_key.name;
    }

    if (serviceParams.global_indexes) {
        handlebarsParams.globalIndexes = getGlobalIndexConfig(ownServiceContext, throughputConfig);
    }
    if (serviceParams.local_indexes) {
        handlebarsParams.localIndexes = getLocalIndexConfig(ownServiceContext);
    }
    if (serviceParams.stream_view_type) {
        handlebarsParams.streamViewType = serviceParams.stream_view_type;
    }
    return handlebars.compileTemplate(`${__dirname}/dynamodb-template.yml`, handlebarsParams);
}

const TABLE_NAME_ALLOWED_PATTERN = /^[a-zA-Z0-9_\-.]{3,255}$/;

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<DynamoDBConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];
    const params = serviceContext.params;

    if (params.table_name && !TABLE_NAME_ALLOWED_PATTERN.test(params.table_name)) {
        errors.push(`${SERVICE_NAME} - The table_name parameter must be between 3 and 255 characters long and may only include alphanumeric characters, underscores (_), hyphens (-), and dots (.)`);
    }

    if (!params.partition_key) {
        errors.push(`${SERVICE_NAME} - The 'partition_key' section is required`);
    }
    else {
        if (!params.partition_key.name) {
            errors.push(`${SERVICE_NAME} - The 'name' field in the 'partition_key' section is required`);
        }
        if (!params.partition_key.type) {
            errors.push(`${SERVICE_NAME} - The 'type' field in the 'partition_key' section is required`);
        }
    }

    // Check throughput
    errors.push(...autoscaling.checkProvisionedThroughput(params.provisioned_throughput, `${SERVICE_NAME} - `));

    // Check global indexes
    if (params.global_indexes) {
        for (const globalIndexConfig of params.global_indexes) {
            if (!globalIndexConfig.name) {
                errors.push(`${SERVICE_NAME} - The 'name' field is required in the 'global_indexes' section`);
            }

            if (!globalIndexConfig.partition_key) {
                errors.push(`${SERVICE_NAME} - The 'partition_key' section is required in the 'global_indexes' section`);
            }
            else {
                if (!globalIndexConfig.partition_key.name) {
                    errors.push(`${SERVICE_NAME} - The 'name' field in the 'partition_key' section is required in the 'global_indexes' section`);
                }
                if (!globalIndexConfig.partition_key.type) {
                    errors.push(`${SERVICE_NAME} - The 'type' field in the 'partition_key' section is required in the 'global_indexes' section`);
                }
            }
            errors.push(...autoscaling.checkProvisionedThroughput(globalIndexConfig.provisioned_throughput, `${SERVICE_NAME} - global_indexes - `));
        }
    }

    // Check local indexes
    if (params.local_indexes) {
        for (const localIndexConfig of params.local_indexes) {
            if (!localIndexConfig.name) {
                errors.push(`${SERVICE_NAME} - The 'name' field is required in the 'local_indexes' section`);
            }

            if (!localIndexConfig.sort_key) {
                errors.push(`${SERVICE_NAME} - The 'sort_key' section is required in the 'local_indexes' section`);
            }
            else {
                if (!localIndexConfig.sort_key.name) {
                    errors.push(`${SERVICE_NAME} - The 'name' field in the 'sort_key' section is required in the 'local_indexes' section`);
                }
                if (!localIndexConfig.sort_key.type) {
                    errors.push(`${SERVICE_NAME} - The 'type' field in the 'sort_key' section is required in the 'local_indexes' section`);
                }
            }
        }
    }

    return errors;
}

export async function deploy(ownServiceContext: ServiceContext<DynamoDBConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]) {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying table ${stackName}`);

    const stackTags = tagging.getTags(ownServiceContext);

    const compiledTemplate = await getCompiledDynamoTemplate(stackName, ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(stackName, compiledTemplate, [], false, SERVICE_NAME, 30, stackTags);
    await autoscaling.deployAutoscaling(stackName, ownServiceContext, SERVICE_NAME, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying table ${stackName}`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function produceEvents(ownServiceContext: ServiceContext<DynamoDBConfig>, ownDeployContext: DeployContext, eventConsumerConfig: ServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext) {
    return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
}

export async function unDeploy(ownServiceContext: ServiceContext<DynamoDBConfig>) {
    await autoscaling.undeployAutoscaling(ownServiceContext);
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [
    'lambda'
];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
