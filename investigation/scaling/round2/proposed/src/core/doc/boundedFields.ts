import type {FieldCache} from "../features/target";
import {retainedBytes} from "./resultStore";
/** Derived distance/path fields: editing a feature must not retain every old outline forever. */
export class BoundedFields extends Map<string,FieldCache extends Map<string,infer V>?V:never> {
  private costs=new Map<string,number>();private bytes=0;
  revision=0;
  constructor(readonly budget=32*1024*1024){super();}
  override get(key:string){const value=super.get(key);if(value!==undefined){super.delete(key);super.set(key,value);}return value;}
  override set(key:string,value:FieldCache extends Map<string,infer V>?V:never):this {
    this.delete(key);const cost=retainedBytes(value);
    while(this.size&&this.bytes+cost>this.budget)this.delete(this.keys().next().value!);
    if(cost<=this.budget){super.set(key,value);this.costs.set(key,cost);this.bytes+=cost;this.revision++;}return this;
  }
  override delete(key:string):boolean {this.bytes-=this.costs.get(key)??0;this.costs.delete(key);const removed=super.delete(key);if(removed)this.revision++;return removed;}
  override clear():void {super.clear();this.costs.clear();this.bytes=0;this.revision++;}
  get stats(){return {bytes:this.bytes,budget:this.budget,entries:this.size};}
}
