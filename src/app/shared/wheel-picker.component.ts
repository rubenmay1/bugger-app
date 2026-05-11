import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5; // odd number so the centre row is clearly the selected one

@Component({
  selector: 'app-wheel-picker',
  templateUrl: './wheel-picker.component.html',
  styleUrls: ['./wheel-picker.component.scss'],
  standalone: false,
})
export class WheelPickerComponent implements AfterViewInit, OnChanges {
  @Input() items: number[] = [];
  @Input() value = 0;
  @Input() format: (n: number) => string = n => String(n);
  @Output() valueChange = new EventEmitter<number>();

  @ViewChild('list') list?: ElementRef<HTMLDivElement>;

  readonly itemHeight = ITEM_HEIGHT;
  readonly padding = ((VISIBLE_ITEMS - 1) / 2) * ITEM_HEIGHT;

  private scrollTimer: any = null;

  ngAfterViewInit() {
    this.scrollToValue();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['value'] && this.list) this.scrollToValue();
  }

  private scrollToValue() {
    const idx = this.items.indexOf(this.value);
    if (idx < 0 || !this.list) return;
    this.list.nativeElement.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'auto' });
  }

  onScroll() {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => this.commitScroll(), 90);
  }

  private commitScroll() {
    if (!this.list) return;
    const top = this.list.nativeElement.scrollTop;
    const idx = Math.round(top / ITEM_HEIGHT);
    const snapped = idx * ITEM_HEIGHT;
    if (Math.abs(snapped - top) > 0.5) {
      this.list.nativeElement.scrollTo({ top: snapped, behavior: 'smooth' });
    }
    const next = this.items[Math.max(0, Math.min(this.items.length - 1, idx))];
    if (next !== undefined && next !== this.value) {
      this.value = next;
      this.valueChange.emit(next);
    }
  }
}
