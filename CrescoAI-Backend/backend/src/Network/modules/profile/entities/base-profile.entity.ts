import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_profiles')
@Index(['userId'], { unique: true })
export class BaseProfileEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', default: '' })
  name!: string;

  @Column({ type: 'varchar', default: '' })
  gender!: string;

  @Column({ type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ type: 'varchar', default: '' })
  educationLevel!: string;

  @Column({ type: 'text', default: '[]' })
  educationBackgroundJson!: string;

  @Column({ type: 'varchar', default: '' })
  currentCity!: string;

  @Column({ type: 'varchar', default: '' })
  currentStatus!: string;

  @Column({ type: 'varchar', default: '' })
  currentRole!: string;

  @Column({ type: 'varchar', default: '' })
  currentIndustry!: string;

  @Column({ type: 'float', nullable: true })
  yearsOfExperience!: number | null;

  @Column({ type: 'varchar', default: '' })
  contactLanguage!: string;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
