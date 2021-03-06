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

/**
 * This module exists because I haven't yet been able to figure out a way
 * to mock the AWS SDK when using Sinon and TypeScript. The 'aws-sdk-mock'
 * tool doesn't work in TypeScript, and I have yet to find out how to use
 * Sinon to mock the SDK when using promises.
 */

import * as AWS from 'aws-sdk';

const awsWrapper = {
    cloudFormation: {
        describeStacks: (params: AWS.CloudFormation.DescribeStacksInput) => {
            const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
            return cloudformation.describeStacks(params).promise();
        },
        waitFor: (stackState: any, params: AWS.CloudFormation.DescribeStacksInput) => {
            const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
            return cloudformation.waitFor(stackState, params).promise();
        },
        createStack: (params: AWS.CloudFormation.CreateStackInput) => {
            const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
            return cloudformation.createStack(params).promise();
        },
        deleteStack: (params: AWS.CloudFormation.DeleteStackInput) => {
            const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
            return cloudformation.deleteStack(params).promise();
        },
        describeStackEvents: (params: AWS.CloudFormation.DescribeStackEventsInput) => {
            const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
            return cloudformation.describeStackEvents(params).promise();
        },
        updateStack: (params: AWS.CloudFormation.UpdateStackInput) => {
            const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15' });
            return cloudformation.updateStack(params).promise();
        }
    },
    ec2: {
        describeSecurityGroups: (params: AWS.EC2.DescribeSecurityGroupsRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.describeSecurityGroups(params).promise();
        },
        revokeSecurityGroupIngress: (params: AWS.EC2.RevokeSecurityGroupIngressRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.revokeSecurityGroupIngress(params).promise();
        },
        authorizeSecurityGroupIngress: (params: AWS.EC2.AuthorizeSecurityGroupIngressRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.authorizeSecurityGroupIngress(params).promise();
        }
    },
    s3: {
        upload: (params: AWS.S3.PutObjectRequest) => {
            const s3 = new AWS.S3({apiVersion: '2006-03-01'});
            return  s3.upload(params).promise();
        },
        listBuckets: () => {
            const s3 = new AWS.S3({apiVersion: '2006-03-01'});
            return s3.listBuckets().promise();
        },
        createBucket: (params: AWS.S3.CreateBucketRequest): Promise<AWS.S3.CreateBucketOutput> => {
            const s3 = new AWS.S3({apiVersion: '2006-03-01'});
            return s3.createBucket(params).promise();
        },
        listObjectsV2: (params: AWS.S3.ListObjectsV2Request) => {
            const s3 = new AWS.S3({apiVersion: '2006-03-01'});
            return s3.listObjectsV2(params).promise();
        },
        deleteObjects: (params: AWS.S3.DeleteObjectsRequest) => {
            const s3 = new AWS.S3({apiVersion: '2006-03-01'});
            return s3.deleteObjects(params).promise();
        },
        putBucketTagging: (params: AWS.S3.PutBucketTaggingRequest) => {
            const s3 = new AWS.S3({apiVersion: '2006-03-01'});
            return s3.putBucketTagging(params).promise();
        }
    },
    ssm: {
        putParameter: (params: AWS.SSM.PutParameterRequest): Promise<AWS.SSM.PutParameterResult> => {
            const ssm = new AWS.SSM({ apiVersion: '2014-11-06' });
            return ssm.putParameter(params).promise();
        },
        deleteParameter: (params: AWS.SSM.DeleteParameterRequest): Promise<AWS.SSM.DeleteParameterResult> => {
            const ssm = new AWS.SSM({ apiVersion: '2014-11-06' });
            return ssm.deleteParameter(params).promise();
        },
        deleteParameters: (params: AWS.SSM.DeleteParametersRequest): Promise<AWS.SSM.DeleteParametersResult> => {
            const ssm = new AWS.SSM({ apiVersion: '2014-11-06' });
            return ssm.deleteParameters(params).promise();
        }
    }
};

export default awsWrapper;
