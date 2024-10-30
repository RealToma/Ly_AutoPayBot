import * as mongoose from "mongoose";
import { MONGO_URI } from "../src/config/env";
import { User } from "./User";
import { ServiceStatus } from "../src/common/types";
import { PanelType, getPackages } from "../src/helper/panel_client";
import { Service } from "./Service";

async function migrate() {
  mongoose.set("strictQuery", false);
  await mongoose.connect(MONGO_URI, {
    autoCreate: true,
    autoIndex: true,
  });

  const users = await User.find();

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    if (!user.service) continue;

    const service = await Service.findById(user.service);

    if (!service) {
      // impossible case - just for typescript compile errors
      continue;
    }

    // update service data
    service.panelType = PanelType.XUI;
    service.currency = user.currency || "GBP";
    service.confirmMsg = user.confirmMsg;
    const { plans, trialPlans } = await getPackages(service);
    service.isTrialEnabled = true;
    service.trialPlans = trialPlans.map((plan, index) => {
      return {
        id: `${index + 1}`,
        originalId: plan.value,
        title: plan.description,
        panelTitle: plan.description,
        paymentTitle: "",
        enabled: true,
      };
    });

    // update user data
    user.serviceName = service.serviceName;
    user.serviceMode = service.serviceMode;
    user.isPurchaseEnabled = service.isPurchaseEnabled;
    user.isRenewEnabled = service.isRenewEnabled;
    user.services = [user.service];
    user.invoice = undefined;
    user.triedServices = [];

    // clear old data for service
    service.serviceName = undefined;
    service.serviceMode = undefined;
    service.isPurchaseEnabled = undefined;
    service.isRenewEnabled = undefined;

    // clear old data for user
    user.currency = undefined;
    user.confirmMsg = undefined;
    user.service = undefined;
    user.paymentLink = undefined;
    user.paymentId = undefined;
    user.newServiceMode = undefined;

    // save result
    await service.save();
    await user.save();
  }
  await mongoose.disconnect();
}

migrate()
  .then(() => console.log("Updated"))
  .catch((err) => console.error(err));
