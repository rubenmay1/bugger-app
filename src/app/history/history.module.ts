import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { HistoryPage } from './history.page';
import { SharedModule } from '../shared/shared.module';

const routes: Routes = [{ path: '', component: HistoryPage }];

@NgModule({
  imports: [CommonModule, IonicModule, SharedModule, RouterModule.forChild(routes)],
  declarations: [HistoryPage],
})
export class HistoryPageModule {}
