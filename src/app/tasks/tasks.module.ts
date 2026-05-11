import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { TasksPage } from './tasks.page';
import { TaskCreateModal } from './task-create.modal';
import { TaskEditModal } from './task-edit.modal';
import { SharedModule } from '../shared/shared.module';

const routes: Routes = [{ path: '', component: TasksPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SharedModule, RouterModule.forChild(routes)],
  declarations: [TasksPage, TaskCreateModal, TaskEditModal],
})
export class TasksPageModule {}
