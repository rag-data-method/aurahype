#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SiteForgeStack } from "../lib/site-forge-stack.js";

const app = new cdk.App();
new SiteForgeStack(app, "InstagramSiteForge", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
