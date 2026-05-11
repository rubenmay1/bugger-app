import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { AppHeaderComponent } from './app-header.component';
import { WheelPickerComponent } from './wheel-picker.component';

@NgModule({
  declarations: [AppHeaderComponent, WheelPickerComponent],
  imports: [CommonModule, FormsModule, IonicModule],
  exports: [AppHeaderComponent, WheelPickerComponent],
})
export class SharedModule {}
