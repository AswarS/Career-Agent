import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('conversations')
export class ConversationEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ nullable: false })
  userId!: number;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  preview?: string;

  @Column()
  updatedAt!: Date;

  @Column()
  createdAt!: Date;
}
