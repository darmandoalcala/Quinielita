$file = "c:\Users\HP\Documents\Quinielita\eliminatoria\index.html"
$html = Get-Content $file -Raw

function Create-Match($fase, $num) {
    return @"
                                <div class="bracket-match">
                                    <div class="compact-match-card pulsing-border">
                                        <div class="compact-header">
                                            <span class="match-group">$fase - L$num</span>
                                            <span class="match-time">12 Jun, 01:00 p.m.</span>
                                        </div>
                                        
                                        <div class="compact-team-row">
                                            <div class="compact-team-info">
                                                <div class="flag-wrapper"><div class="flag-img"></div></div>
                                                <span class="team-name">Por Definir</span>
                                            </div>
                                            <input type="number" class="compact-score-input" disabled placeholder="-">
                                        </div>
                                        
                                        <div class="compact-team-row">
                                            <div class="compact-team-info">
                                                <div class="flag-wrapper"><div class="flag-img"></div></div>
                                                <span class="team-name">Por Definir</span>
                                            </div>
                                            <input type="number" class="compact-score-input" disabled placeholder="-">
                                        </div>
                                    </div>
                                </div>
"@
}

function Create-Matchup($fase, $m1, $m2) {
    $html1 = Create-Match $fase $m1
    $html2 = Create-Match $fase $m2
    return @"
                            <div class="bracket-matchup">
$html1
$html2
                            </div>
"@
}

# Left Wing
$leftWing = @"
                <div class="left-wing">
                    <div class="bracket-col">
                        <h3 class="bracket-column-title">16avos</h3>
$((1,3,5,7 | % { Create-Matchup "16avos" $_ ($_ + 1) }) -join "`n")
                    </div>
                </div>
"@

# Right Wing
$rightWing = @"
                <div class="right-wing">
                    <div class="bracket-col">
                        <h3 class="bracket-column-title">16avos</h3>
$((9,11,13,15 | % { Create-Matchup "16avos" $_ ($_ + 1) }) -join "`n")
                    </div>
                </div>
"@

# Center Final
$centerFinal = @"
                <div class="center-final">
                    <div id="trophy-destination" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-height: 300px; padding: 20px;">
                        <!-- The trophy animation image will be transplanted here -->
                    </div>
                </div>
"@

$bracketHtml = @"
            <div class="converging-bracket-wrapper">
                <div class="converging-bracket">
$leftWing
$centerFinal
$rightWing
                </div>
            </div>
"@

# Delete old matches grid stuff
$html = $html -replace '(?s)<h3 style="color: var\(--primary\); margin: 2rem 0 1rem; text-transform: uppercase; font-family: var\(--font-heading\); letter-spacing: 1px;">16avos de Final</h3>.*?</section>', ($bracketHtml + "`n            </section>")
Set-Content -Path $file -Value $html -Encoding UTF8
Write-Host "Generacion completada"
