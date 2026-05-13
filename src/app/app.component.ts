import { Component, OnInit } from '@angular/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SchedulerService } from './services/scheduler.service';
import { TaskService } from './services/task.service';
import { OemService } from './services/oem.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  constructor(
    private tasks: TaskService,
    private scheduler: SchedulerService,
    private oem: OemService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.tasks.load();
    await this.scheduler.ensureChannel();
    await this.scheduler.registerActions();
    await this.scheduler.ensurePermission();

    const prefs = this.tasks.currentPrefs;
    const tier = await this.oem.getOEMRiskTier();
    if (tier !== prefs.oemRiskTier) {
      await this.tasks.updatePrefs({ ...prefs, oemRiskTier: tier });
    }

    LocalNotifications.addListener('localNotificationActionPerformed', async event => {
      if (event.actionId === 'complete') {
        const taskId = event.notification.extra?.taskId;
        if (typeof taskId === 'number') {
          await this.tasks.complete(taskId);
        }
      }
    });

    LocalNotifications.addListener('localNotificationReceived', async () => {
      await this.tasks.selfTest();
    });

    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        await this.tasks.selfTest();
      }
    });

    await this.tasks.selfTest();
  }
}
