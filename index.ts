import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const infraStackName = config.require("infraStackName");

const appName = "blog";
const appLabels = {
    app: appName
};

const infraStack = new pulumi.StackReference("infraStack", { name: infraStackName });
const kubeconfig = infraStack.getOutput("kubeconfig");
const dbConfig = infraStack.getOutput("dbConfig");

const k8sProvider = new k8s.Provider("k8sProvider", {
    kubeconfig: kubeconfig.apply(config => JSON.stringify(config)),
});

const deployment = new k8s.apps.v1.Deployment(
    "blog",
    {
        spec: {
            selector: {
                matchLabels: appLabels
            },
            replicas: 1,
            template: {
                metadata: {
                    labels: appLabels,
                },
                spec: {
                    containers: [
                        {
                            name: "ghost",
                            image: "ghost",
                            env: [
                                { name: "database__client", value: dbConfig.apply(c => c.blog.client) },
                                { name: "database__connection__host", value: dbConfig.apply(c => c.blog.host) },
                                { name: "database__connection__port", value: dbConfig.apply(c => c.blog.port.toString()) },
                                { name: "database__connection__user", value: dbConfig.apply(c => c.blog.user) },
                                { name: "database__connection__password", value: dbConfig.apply(c => c.blog.password) },
                                { name: "database__connection__database", value: dbConfig.apply(c => c.blog.database) },
                            ]
                        }
                    ],

                },
            },
        },
    },
    {
        provider: k8sProvider,
    }
);

const blog = new k8s.core.v1.Service(
    appName,
    {
        metadata: {
            labels: deployment.spec.apply(spec => spec.template.metadata.labels),
        },
        spec: {
            type: "LoadBalancer",
            ports: [
                {
                    port: 80,
                    targetPort: 2368,
                    protocol: "TCP",
                },
            ],
            selector: appLabels,
        },
    },
    {
        provider: k8sProvider,
    }
);

export const ingress = blog.status.apply(status => status.loadBalancer.ingress[0]);
