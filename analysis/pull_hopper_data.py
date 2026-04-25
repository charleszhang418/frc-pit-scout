#!/usr/bin/env python3
"""
Pull and analyze 2026 Hopper Division team data from Statbotics
"""
import statbotics
import pandas as pd
import json
import os

# Hopper Division teams (75 teams)
HOPPER_TEAMS = [
    188, 238, 401, 494, 503, 540, 573, 581, 761, 910,
    1014, 1259, 1287, 1296, 1625, 1701, 1706, 1710, 1732, 1787,
    1986, 2056, 2102, 2199, 2220, 2383, 2486, 2607, 2659, 2834,
    3015, 3035, 3175, 3297, 3467, 3506, 3512, 3539, 3641, 4143,
    4174, 4191, 4201, 4613, 4698, 5000, 5086, 5348, 5406, 5454,
    6121, 6152, 6200, 6328, 6329, 6517, 6639, 7287, 7451, 8005,
    8044, 8214, 8267, 8513, 8749, 9449, 9692, 9785, 10131, 10907,
    11024, 11118, 11270, 11303, 11493
]

def main():
    print("Connecting to Statbotics API...")
    sb = statbotics.Statbotics()
    
    all_data = []
    print(f"Fetching data for {len(HOPPER_TEAMS)} Hopper teams...")
    
    for i, team_num in enumerate(HOPPER_TEAMS):
        try:
            # Get team's 2026 season data
            team_year = sb.get_team_year(team=team_num, year=2026)
            all_data.append(team_year)
            if (i + 1) % 10 == 0:
                print(f"  Processed {i + 1}/{len(HOPPER_TEAMS)} teams...")
        except Exception as e:
            print(f"  Warning: Could not get data for team {team_num}: {e}")
            # Try to get basic team info at least
            try:
                team_info = sb.get_team(team=team_num)
                all_data.append({
                    'team': team_num,
                    'name': team_info.get('name', 'Unknown'),
                    'epa': None,
                    'auto_epa': None,
                    'teleop_epa': None,
                    'endgame_epa': None,
                    'record': {'wins': 0, 'losses': 0},
                    'country': team_info.get('country'),
                    'state': team_info.get('state'),
                })
            except:
                all_data.append({
                    'team': team_num,
                    'name': 'Unknown',
                    'epa': None,
                })
    
    print(f"\nSuccessfully fetched data for {len(all_data)} teams")
    
    # Save raw JSON
    os.makedirs('analysis', exist_ok=True)
    with open('analysis/hopper_raw_data.json', 'w') as f:
        json.dump(all_data, f, indent=2, default=str)
    print("Saved raw data to analysis/hopper_raw_data.json")
    
    # Create DataFrame and save CSV
    df = pd.json_normalize(all_data)
    df.to_csv('analysis/hopper_teams_2026.csv', index=False)
    print("Saved CSV to analysis/hopper_teams_2026.csv")
    
    # Print summary
    print("\n" + "="*60)
    print("HOPPER DIVISION 2026 - QUICK STATS")
    print("="*60)
    
    if 'epa.total.mean' in df.columns:
        epa_col = 'epa.total.mean'
    elif 'epa' in df.columns:
        epa_col = 'epa'
    else:
        # Find the EPA column
        epa_cols = [c for c in df.columns if 'epa' in c.lower() and 'mean' in c.lower()]
        epa_col = epa_cols[0] if epa_cols else None
    
    if epa_col and df[epa_col].notna().any():
        df_valid = df[df[epa_col].notna()].copy()
        df_valid = df_valid.sort_values(epa_col, ascending=False)
        
        print(f"\nTop 15 teams by EPA ({epa_col}):")
        print("-" * 50)
        for _, row in df_valid.head(15).iterrows():
            team = int(row['team'])
            name = row.get('name', 'Unknown')
            epa = row[epa_col]
            print(f"  {team:>5}  {name:<30} EPA: {epa:.1f}")
        
        print(f"\n\nEPA Distribution:")
        print(f"  Mean: {df_valid[epa_col].mean():.1f}")
        print(f"  Median: {df_valid[epa_col].median():.1f}")
        print(f"  Std Dev: {df_valid[epa_col].std():.1f}")
        print(f"  Max: {df_valid[epa_col].max():.1f}")
        print(f"  Min: {df_valid[epa_col].min():.1f}")
    else:
        print("\nNo EPA data available yet for 2026 season")
        print("(Data becomes available after teams play matches)")
    
    return df

if __name__ == "__main__":
    main()
