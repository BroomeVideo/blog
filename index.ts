import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

const appName = "blog";
const appLabels = {
    app: appName
};

const config = new pulumi.Config();
const infraStackName = config.require("infraStackName");

// Get a reference to the infrastructure stack.
const infraStack = new pulumi.StackReference("infraStack", { name: infraStackName });

// Obtain the Kubernetes configuration and database-connection details
// supplied by the infrastructure stack.
const kubeconfig = infraStack.getOutput("kubeconfig");
const dbConfig = infraStack.getOutput("dbConfig");

// With the supplied kubeconfig, create a Kubernetes provider for the blog application.
const k8sProvider = new k8s.Provider("k8sProvider", {
    kubeconfig: kubeconfig.apply(config => JSON.stringify(config)),
});

// Create a Kubernetes deployment for the blog application.
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
                            // https://ghost.org/
                            // https://hub.docker.com/_/ghost/
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

// Expose the blog publicly as a Kubernetes LoadBalancer service.
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

// Export the blog's public hostname.
export const host = blog.status.apply(status => status.loadBalancer.ingress[0].hostname);
