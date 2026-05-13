import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { AppHeaderComponent } from './app-header.component';

@NgModule({
  declarations: [AppHeaderComponent],
  imports: [CommonModule, FormsModule, IonicModule],
  exports: [AppHeaderComponent],
})
export class SharedModule {}
