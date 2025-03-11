#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

declare_id!("HJPdbG1P64vHKYU8MqTHhsWGwKVxRTcbKp1vQRU1RvrL");

#[program]
pub mod voting {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        _poll_id: u64,
        poll_start: u64,
        poll_end: u64,
        poll_question: String,
    ) -> Result<()> {
        let poll = &mut ctx.accounts.pool;
        poll.pool_start_date = poll_start;
        poll.pool_end_date = poll_end;
        poll.pool_question = poll_question;
        poll.candidate_count = 0;
        poll.is_closed = false;

        msg!("Poll {} initialized successfully!", poll.pool_question);
        Ok(())
    }

    pub fn initialize_candidate(
        ctx: Context<InitializeCandidate>,
        _pool_id: u64,
        candidate_name: String,
    ) -> Result<()> {
        let candidate = &mut ctx.accounts.candidate;
        candidate.candidate_name = candidate_name;
        candidate.candidate_votes = 0;

        let poll = &mut ctx.accounts.pool;
        poll.candidate_count += 1;

        msg!("Candidate {} for Poll {} initialized successfully!", candidate.candidate_name, poll.pool_question);
        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, _poll_id: u64, _candidate_name: String) -> Result<()> {
        let candidate = &mut ctx.accounts.candidate;
        let voter_record = &mut ctx.accounts.voter_record;
        let poll = &ctx.accounts.poll;

        if voter_record.has_voted {
            return Err(VotingError::AlreadyVoted.into());
        }

        let current_time = Clock::get()?.unix_timestamp as u64;
        if current_time > poll.pool_end_date {
            return Err(VotingError::PollClosed.into());
        }

        voter_record.has_voted = true;
        voter_record.timestamp = Clock::get()?.unix_timestamp;

        candidate.candidate_votes += 1;

        msg!("Vote for {} cast successfully!", candidate.candidate_name);
        msg!("Total votes for {}: {}", candidate.candidate_name, candidate.candidate_votes);
        Ok(())
    }
}

// Assuming this is what you meant by Voting account
#[account]
#[derive(InitSpace)]
pub struct Voting {
    is_initialized: bool,
    pool_count: u64,
}

#[derive(Accounts)]
pub struct InitializeVoting<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        space = 8 + Voting::INIT_SPACE,
        payer = payer
    )]
    pub voting: Account<'info, Voting>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pool_id: u64, candidate_name: String)]
pub struct Vote<'info> {
    #[account(
        mut,
        seeds = [
            b"poll".as_ref(), 
            pool_id.to_le_bytes().as_ref()],
            bump
        )]
    pub poll: Account<'info, Poll>,

    #[account(
        mut,
        seeds = [
            b"candidate".as_ref(), 
            pool_id.to_le_bytes().as_ref(),
            candidate_name.as_ref(),
            ],
            bump
        )]
    pub candidate: Account<'info, Candidate>,

    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + VoterRecord::INIT_SPACE,
        seeds = [
            b"voter".as_ref(),
            pool_id.to_le_bytes().as_ref(),
            voter.key().as_ref(),
        ],
        bump
    )]
    pub voter_record: Account<'info, VoterRecord>,

    #[account(mut)]
    pub voter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pool_id: u64, candidate_name: String)]
pub struct InitializeCandidate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Candidate::INIT_SPACE,
        seeds = [
            b"candidate".as_ref(), 
            pool_id.to_le_bytes().as_ref(), 
            candidate_name.as_ref()],
        bump
    )]
    pub candidate: Account<'info, Candidate>,
    
    #[account(
        mut,
        seeds = [
            b"poll".as_ref(), 
            pool_id.to_le_bytes().as_ref()],
            bump
        )]
    pub pool: Account<'info, Poll>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct InitializePool<'info> {
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Poll::INIT_SPACE,
        seeds = [b"poll".as_ref(), pool_id.to_le_bytes().as_ref()],
        bump
    )]
    pub pool: Account<'info, Poll>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Poll {
    #[max_len(280)]
    pool_question: String,
    pool_start_date: u64,
    pool_end_date: u64,
    candidate_count: u64,
    is_closed: bool,
}

#[account]
#[derive(InitSpace)]
pub struct Candidate {
    #[max_len(100)]
    candidate_name: String,
    candidate_votes: u64,
}

// VoterRecord account to track voting status
#[account]
#[derive(InitSpace)]
pub struct VoterRecord {
    has_voted: bool,
    timestamp: i64,
}

// Error codes (unchanged)
#[error_code]
pub enum VotingError {
    #[msg("The voter has already cast a vote in this poll.")]
    AlreadyVoted,
    #[msg("The poll is closed and no more votes can be cast.")]
    PollClosed,
}