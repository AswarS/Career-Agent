import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('artifacts')
export class ArtifactEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ nullable: true, type: 'integer' })
  uid!: number;

  @Column({ nullable: true, type: 'text' })
  type?: string;

  @Column({ nullable: true, type: 'text' })
  title?: string;

  @Column({ nullable: true, type: 'text' })
  status?: string;

  @Column({ nullable: true, type: 'text' })
  renderMode?: string;

  @Column({ nullable: true, type: 'text' })
  summary?: string;

  @Column({ nullable: true, type: 'text' })
  payloadPath?: string;

  @Column({ nullable: true })
  createdAt?: Date;
}
