import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as os from "os";

let publicKey = fs.readFileSync(os.homedir() + "/.ssh/id_ed25519.pub", "utf-8");

// Create a new VPC
const vpc = new aws.ec2.Vpc("my-vpc", {
  cidrBlock: "10.0.0.0/16",
});

// Create a subnet in the VPC
const subnet = new aws.ec2.Subnet("my-subnet", {
  vpcId: vpc.id,
  cidrBlock: "10.0.1.0/24",
});

// Create a security group for our instance that allows SSH
const sg = new aws.ec2.SecurityGroup("my-sg", {
  vpcId: vpc.id,
  ingress: [
    { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] },
  ],
});

let amiId = pulumi
  .output(
    aws.ec2.getAmi({
      filters: [
        {
          name: "name",
          values: ["cloudimg-nodejs18-debian11v1.0.0*"],
        },
      ],
      owners: ["679593333241"],
      mostRecent: true,
    })
  )
  .apply((ami) => ami.id);

// Create an EC2 instance
const server = new aws.ec2.Instance("web-server-www", {
  instanceType: "C5n",
  vpcSecurityGroupIds: [sg.name], // reference the security group
  ami: amiId,
  subnetId: subnet.id, // reference subnet
  userData: `#!/bin/bash
    echo '${publicKey}' >> /root/.ssh/authorized_keys
    chown root:root /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys`,
});

// Create an Elastic IP
const eip = new aws.ec2.Eip("web-server-eip", {});

// Associate the Elastic IP with the EC2 instance
new aws.ec2.EipAssociation("web-server-eip-assoc", {
  instanceId: server.id,
  publicIp: eip.publicIp,
});

eip.publicIp.apply((t) => {
  console.log("Public IP:", t);
});
eip.publicDns.apply((t) => {
  console.log("Public DNS:", t);
});
