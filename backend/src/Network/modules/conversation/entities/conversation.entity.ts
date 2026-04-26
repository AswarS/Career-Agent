import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('conversations')
export class ConversationEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  cid!: number;
  @Column({type:'text'})
  id!: string;
  @Column({ nullable: false })
  userId!: number;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  preview?: string;

  @Column({ default: 'active' })
  status!: string;

  @Column()
  updatedAt!: Date;

  @Column()
  createdAt!: Date;
}
