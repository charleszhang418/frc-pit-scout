#!/usr/bin/env python3
"""
Create visualizations for Hopper Division 2026 pre-scouting
"""
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import json
import os

# Your team number
YOUR_TEAM = 11118

# Set style
plt.style.use('seaborn-v0_8-darkgrid')
plt.rcParams['figure.facecolor'] = '#1a1a2e'
plt.rcParams['axes.facecolor'] = '#1a1a2e'
plt.rcParams['axes.edgecolor'] = '#444'
plt.rcParams['axes.labelcolor'] = '#eee'
plt.rcParams['xtick.color'] = '#ccc'
plt.rcParams['ytick.color'] = '#ccc'
plt.rcParams['text.color'] = '#eee'
plt.rcParams['grid.color'] = '#333'
plt.rcParams['legend.facecolor'] = '#232340'
plt.rcParams['legend.edgecolor'] = '#444'

def main():
    # Load data
    with open('analysis/hopper_raw_data.json', 'r') as f:
        raw_data = json.load(f)
    
    # Normalize and create DataFrame
    df = pd.json_normalize(raw_data)
    
    # Identify key columns
    epa_total = 'epa.total_points.mean' if 'epa.total_points.mean' in df.columns else 'epa'
    auto_epa = 'epa.breakdown.auto_points' if 'epa.breakdown.auto_points' in df.columns else None
    teleop_epa = 'epa.breakdown.teleop_points' if 'epa.breakdown.teleop_points' in df.columns else None
    endgame_epa = 'epa.breakdown.endgame_points' if 'epa.breakdown.endgame_points' in df.columns else None
    
    # Filter to teams with valid EPA
    df_valid = df[df[epa_total].notna()].copy()
    df_valid = df_valid.sort_values(epa_total, ascending=False)
    
    print(f"Analyzing {len(df_valid)} teams with EPA data")
    print(f"Columns available: {list(df.columns)[:20]}...")
    
    os.makedirs('analysis/charts', exist_ok=True)
    
    # ===== CHART 1: Top 20 Teams by Total EPA (with your team) =====
    fig, ax = plt.subplots(figsize=(14, 9))
    top20 = df_valid.head(20)
    
    # Check if your team is in top 20, if not add them
    your_team_in_top20 = YOUR_TEAM in top20['team'].values
    your_team_row = df_valid[df_valid['team'] == YOUR_TEAM]
    your_team_rank = list(df_valid['team']).index(YOUR_TEAM) + 1 if YOUR_TEAM in df_valid['team'].values else None
    
    if not your_team_in_top20 and len(your_team_row) > 0:
        # Add your team to the display
        display_df = pd.concat([top20, your_team_row])
    else:
        display_df = top20
    
    colors = []
    for i, (_, row) in enumerate(display_df.iterrows()):
        if int(row['team']) == YOUR_TEAM:
            colors.append('#ef4444')  # Red for your team
        elif i < 5:
            colors.append('#6c63ff')
        elif i < 10:
            colors.append('#3b82f6')
        else:
            colors.append('#22c55e')
    
    bars = ax.barh(range(len(display_df)), display_df[epa_total].values, color=colors)
    
    labels = []
    for _, row in display_df.iterrows():
        team_num = int(row['team'])
        if team_num == YOUR_TEAM:
            labels.append(f">>> {team_num} - {row['name'][:18]} (#{your_team_rank})")
        else:
            labels.append(f"{team_num} - {row['name'][:20]}")
    
    ax.set_yticks(range(len(display_df)))
    ax.set_yticklabels(labels, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlabel('EPA (Expected Points Added)', fontsize=12)
    ax.set_title(f'Hopper Division 2026 - Top 20 Teams by EPA\n(Your team {YOUR_TEAM} highlighted in red)', fontsize=14, fontweight='bold', pad=15)
    
    # Add value labels
    for i, (bar, val) in enumerate(zip(bars, display_df[epa_total].values)):
        ax.text(val + 3, bar.get_y() + bar.get_height()/2, f'{val:.0f}', va='center', fontsize=8, color='#eee')
    
    # Legend for tiers
    legend_elements = [
        mpatches.Patch(facecolor='#ef4444', label=f'Your Team ({YOUR_TEAM})'),
        mpatches.Patch(facecolor='#6c63ff', label='Tier 1 (Top 5)'),
        mpatches.Patch(facecolor='#3b82f6', label='Tier 2 (6-10)'),
        mpatches.Patch(facecolor='#22c55e', label='Tier 3 (11-20)')
    ]
    ax.legend(handles=legend_elements, loc='lower right', fontsize=9)
    
    plt.tight_layout()
    plt.savefig('analysis/charts/01_top20_epa.png', dpi=150, facecolor='#1a1a2e')
    plt.close()
    print("Created: 01_top20_epa.png")
    
    # ===== CHART 2: EPA Distribution Histogram =====
    fig, ax = plt.subplots(figsize=(12, 6))
    n, bins, patches = ax.hist(df_valid[epa_total], bins=20, color='#6c63ff', edgecolor='#444', alpha=0.8)
    
    # Color bins
    mean_epa = df_valid[epa_total].mean()
    for patch, left_edge in zip(patches, bins[:-1]):
        if left_edge >= mean_epa + df_valid[epa_total].std():
            patch.set_facecolor('#22c55e')
        elif left_edge >= mean_epa:
            patch.set_facecolor('#3b82f6')
        elif left_edge < mean_epa - df_valid[epa_total].std():
            patch.set_facecolor('#ef4444')
    
    ax.axvline(mean_epa, color='#f59e0b', linestyle='--', linewidth=2, label=f'Mean: {mean_epa:.0f}')
    ax.axvline(df_valid[epa_total].median(), color='#22c55e', linestyle='--', linewidth=2, label=f'Median: {df_valid[epa_total].median():.0f}')
    
    # Mark your team
    your_epa = df_valid[df_valid['team'] == YOUR_TEAM][epa_total].values
    if len(your_epa) > 0:
        ax.axvline(your_epa[0], color='#ef4444', linestyle='-', linewidth=3, label=f'Team {YOUR_TEAM}: {your_epa[0]:.0f}')
        ax.annotate(f'<-- Your Team\n    ({YOUR_TEAM})', 
                    xy=(your_epa[0], ax.get_ylim()[1] * 0.8),
                    fontsize=10, color='#ef4444', fontweight='bold',
                    ha='left')
    
    ax.set_xlabel('EPA (Expected Points Added)', fontsize=12)
    ax.set_ylabel('Number of Teams', fontsize=12)
    ax.set_title('Hopper Division 2026 - EPA Distribution', fontsize=14, fontweight='bold', pad=15)
    ax.legend(loc='upper right', fontsize=10)
    
    plt.tight_layout()
    plt.savefig('analysis/charts/02_epa_distribution.png', dpi=150, facecolor='#1a1a2e')
    plt.close()
    print("Created: 02_epa_distribution.png")
    
    # ===== CHART 3: EPA Components (Auto vs Teleop vs Endgame) =====
    if auto_epa and teleop_epa and endgame_epa:
        fig, ax = plt.subplots(figsize=(14, 12))
        top30 = df_valid.head(30)
        
        # Add your team if not in top 30
        your_team_in_top30 = YOUR_TEAM in top30['team'].values
        your_team_row = df_valid[df_valid['team'] == YOUR_TEAM]
        
        if not your_team_in_top30 and len(your_team_row) > 0:
            display_df = pd.concat([top30, your_team_row])
        else:
            display_df = top30
        
        x = range(len(display_df))
        width = 0.25
        
        ax.barh([i - width for i in x], display_df[auto_epa].fillna(0), width, label='Auto', color='#f59e0b')
        ax.barh(x, display_df[teleop_epa].fillna(0), width, label='Teleop', color='#3b82f6')
        ax.barh([i + width for i in x], display_df[endgame_epa].fillna(0), width, label='Endgame', color='#22c55e')
        
        # Create labels with your team highlighted
        labels = []
        for _, row in display_df.iterrows():
            team_num = int(row['team'])
            if team_num == YOUR_TEAM:
                labels.append(f">>> {team_num}")
            else:
                labels.append(f"{team_num}")
        
        ax.set_yticks(x)
        ax.set_yticklabels(labels, fontsize=9)
        
        # Color your team's label red
        for i, label in enumerate(ax.get_yticklabels()):
            if f">>> {YOUR_TEAM}" in label.get_text():
                label.set_color('#ef4444')
                label.set_fontweight('bold')
        
        ax.invert_yaxis()
        ax.set_xlabel('EPA Contribution', fontsize=12)
        ax.set_title(f'Hopper Division 2026 - EPA Breakdown (Top 30 + Team {YOUR_TEAM})', fontsize=14, fontweight='bold', pad=15)
        ax.legend(loc='lower right', fontsize=10)
        
        plt.tight_layout()
        plt.savefig('analysis/charts/03_epa_components.png', dpi=150, facecolor='#1a1a2e')
        plt.close()
        print("Created: 03_epa_components.png")
    
    # ===== CHART 4: Win Rate vs EPA Scatter =====
    if 'record.wins' in df.columns and 'record.losses' in df.columns:
        df_valid['total_matches'] = df_valid['record.wins'].fillna(0) + df_valid['record.losses'].fillna(0)
        df_scatter = df_valid[df_valid['total_matches'] > 0].copy()
        df_scatter['win_rate'] = df_scatter['record.wins'] / df_scatter['total_matches'] * 100
        
        fig, ax = plt.subplots(figsize=(12, 8))
        scatter = ax.scatter(
            df_scatter[epa_total], 
            df_scatter['win_rate'],
            s=df_scatter['total_matches'] * 3,
            c=df_scatter[epa_total],
            cmap='viridis',
            alpha=0.7,
            edgecolors='#444'
        )
        
        # Highlight your team with a big red marker
        your_team_data = df_scatter[df_scatter['team'] == YOUR_TEAM]
        if len(your_team_data) > 0:
            your_epa = your_team_data[epa_total].values[0]
            your_winrate = your_team_data['win_rate'].values[0]
            your_matches = your_team_data['total_matches'].values[0]
            ax.scatter([your_epa], [your_winrate], c='#ef4444', s=400, 
                      edgecolors='white', linewidth=3, zorder=10, marker='o')
            ax.annotate(f'Team {YOUR_TEAM}', 
                       (your_epa, your_winrate),
                       fontsize=11, color='#ef4444', fontweight='bold',
                       xytext=(10, 10), textcoords='offset points',
                       bbox=dict(boxstyle='round,pad=0.3', facecolor='#1a1a2e', edgecolor='#ef4444'))
        
        # Label top teams
        for _, row in df_scatter.head(10).iterrows():
            if int(row['team']) == YOUR_TEAM:
                continue  # Already labeled
            ax.annotate(
                f"{int(row['team'])}",
                (row[epa_total], row['win_rate']),
                xytext=(5, 5),
                textcoords='offset points',
                fontsize=8,
                color='#eee'
            )
        
        ax.set_xlabel('EPA (Expected Points Added)', fontsize=12)
        ax.set_ylabel('Win Rate (%)', fontsize=12)
        ax.set_title(f'Hopper Division 2026 - EPA vs Win Rate\n(Your team {YOUR_TEAM} highlighted in red)', fontsize=14, fontweight='bold', pad=15)
        plt.colorbar(scatter, label='EPA')
        
        plt.tight_layout()
        plt.savefig('analysis/charts/04_epa_vs_winrate.png', dpi=150, facecolor='#1a1a2e')
        plt.close()
        print("Created: 04_epa_vs_winrate.png")
    
    # ===== CHART 5: All Teams Tier List =====
    fig, ax = plt.subplots(figsize=(16, 12))
    
    # Find which tier your team is in
    your_team_epa = df_valid[df_valid['team'] == YOUR_TEAM][epa_total].values
    your_tier = "Unknown"
    if len(your_team_epa) > 0:
        epa_val = your_team_epa[0]
        if epa_val >= 200:
            your_tier = "S Tier"
        elif epa_val >= 150:
            your_tier = "A Tier"
        elif epa_val >= 100:
            your_tier = "B Tier"
        elif epa_val >= 60:
            your_tier = "C Tier"
        else:
            your_tier = "D Tier"
    
    # Define tiers
    tiers = [
        ('S Tier (Elite)', df_valid[df_valid[epa_total] >= 200], '#6c63ff'),
        ('A Tier (Strong)', df_valid[(df_valid[epa_total] >= 150) & (df_valid[epa_total] < 200)], '#3b82f6'),
        ('B Tier (Above Avg)', df_valid[(df_valid[epa_total] >= 100) & (df_valid[epa_total] < 150)], '#22c55e'),
        ('C Tier (Average)', df_valid[(df_valid[epa_total] >= 60) & (df_valid[epa_total] < 100)], '#f59e0b'),
        ('D Tier (Below Avg)', df_valid[df_valid[epa_total] < 60], '#ef4444'),
    ]
    
    y_pos = 0
    tier_labels = []
    for tier_name, tier_df, color in tiers:
        if len(tier_df) == 0:
            continue
        teams_str = ', '.join([f"{int(row['team'])}" for _, row in tier_df.iterrows()])
        ax.text(0.02, 1 - (y_pos + 0.02), f"{tier_name} ({len(tier_df)} teams)", 
                transform=ax.transAxes, fontsize=11, fontweight='bold', color=color, va='top')
        
        # Wrap team numbers, highlighting your team
        teams_list = []
        for _, row in tier_df.iterrows():
            team_num = int(row['team'])
            if team_num == YOUR_TEAM:
                teams_list.append(f"[{team_num}]")
            else:
                teams_list.append(f"{team_num}")
        
        line = ""
        lines = []
        for t in teams_list:
            if len(line) + len(t) + 2 > 80:
                lines.append(line.rstrip(', '))
                line = t + ", "
            else:
                line += t + ", "
        if line:
            lines.append(line.rstrip(', '))
        
        for i, line_text in enumerate(lines):
            # Check if your team is in this line and color it
            if f"[{YOUR_TEAM}]" in line_text:
                # Split and color differently
                parts = line_text.split(f"[{YOUR_TEAM}]")
                x_offset = 0.02
                for j, part in enumerate(parts):
                    if j > 0:
                        # Add your team in red
                        ax.text(x_offset, 1 - (y_pos + 0.05 + i*0.03), f">>>{YOUR_TEAM}<<<",
                                transform=ax.transAxes, fontsize=9, color='#ef4444', va='top', fontweight='bold')
                        x_offset += 0.08  # approximate width
                    if part:
                        ax.text(x_offset, 1 - (y_pos + 0.05 + i*0.03), part,
                                transform=ax.transAxes, fontsize=9, color='#ccc', va='top')
            else:
                ax.text(0.02, 1 - (y_pos + 0.05 + i*0.03), line_text,
                        transform=ax.transAxes, fontsize=9, color='#ccc', va='top')
        
        y_pos += 0.05 + len(lines) * 0.03 + 0.03
    
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')
    ax.set_title(f'Hopper Division 2026 - Team Tiers by EPA\n(Your team {YOUR_TEAM} is in {your_tier})', fontsize=16, fontweight='bold', pad=20)
    
    plt.tight_layout()
    plt.savefig('analysis/charts/05_tier_list.png', dpi=150, facecolor='#1a1a2e')
    plt.close()
    print("Created: 05_tier_list.png")
    
    # ===== Generate Summary Report =====
    report = []
    report.append("=" * 70)
    report.append("HOPPER DIVISION 2026 - PRE-SCOUTING ANALYSIS")
    report.append("=" * 70)
    report.append(f"\nTotal teams: {len(df_valid)}")
    report.append(f"EPA Range: {df_valid[epa_total].min():.1f} - {df_valid[epa_total].max():.1f}")
    report.append(f"Mean EPA: {df_valid[epa_total].mean():.1f}")
    report.append(f"Median EPA: {df_valid[epa_total].median():.1f}")
    
    report.append("\n" + "-" * 70)
    report.append("TOP 15 TEAMS TO WATCH")
    report.append("-" * 70)
    for i, (_, row) in enumerate(df_valid.head(15).iterrows(), 1):
        auto = row.get(auto_epa, 0) if auto_epa else 0
        teleop = row.get(teleop_epa, 0) if teleop_epa else 0
        endgame = row.get(endgame_epa, 0) if endgame_epa else 0
        wins = int(row.get('record.wins', 0) or 0)
        losses = int(row.get('record.losses', 0) or 0)
        report.append(f"\n{i:2}. Team {int(row['team']):>5} - {row['name']}")
        report.append(f"    EPA: {row[epa_total]:.1f} | Auto: {auto:.1f} | Teleop: {teleop:.1f} | Endgame: {endgame:.1f}")
        report.append(f"    Record: {wins}W-{losses}L")
    
    report.append("\n" + "-" * 70)
    report.append("TIER SUMMARY")
    report.append("-" * 70)
    for tier_name, tier_df, _ in tiers:
        if len(tier_df) > 0:
            report.append(f"\n{tier_name}: {len(tier_df)} teams")
            report.append(f"  Teams: {', '.join([str(int(t)) for t in tier_df['team'].tolist()])}")
    
    report.append("\n" + "-" * 70)
    report.append("YOUR TEAM: 11118 - The Baybies")
    report.append("-" * 70)
    your_team = df_valid[df_valid['team'] == 11118]
    if len(your_team) > 0:
        row = your_team.iloc[0]
        rank = list(df_valid['team']).index(11118) + 1
        auto = row.get(auto_epa, 0) if auto_epa else 0
        teleop = row.get(teleop_epa, 0) if teleop_epa else 0
        endgame = row.get(endgame_epa, 0) if endgame_epa else 0
        report.append(f"Rank in Division: {rank} / {len(df_valid)}")
        report.append(f"Total EPA: {row[epa_total]:.1f}")
        report.append(f"Auto EPA: {auto:.1f} | Teleop EPA: {teleop:.1f} | Endgame EPA: {endgame:.1f}")
        
        # Find similar teams
        your_epa = row[epa_total]
        similar = df_valid[(df_valid[epa_total] >= your_epa - 20) & 
                          (df_valid[epa_total] <= your_epa + 20) & 
                          (df_valid['team'] != 11118)]
        if len(similar) > 0:
            report.append(f"\nTeams with similar EPA (±20): {', '.join([str(int(t)) for t in similar['team'].tolist()])}")
    else:
        report.append("No 2026 data available yet")
    
    report_text = "\n".join(report)
    print("\n" + report_text)
    
    with open('analysis/hopper_analysis_report.txt', 'w') as f:
        f.write(report_text)
    print("\nSaved report to: analysis/hopper_analysis_report.txt")
    print("Charts saved to: analysis/charts/")

if __name__ == "__main__":
    main()
